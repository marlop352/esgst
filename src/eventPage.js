import JSZip from 'jszip';

/**
 * @property {Object} browser.cookies
 */
const browser = (global.chrome && global.chrome.runtime) ? global.chrome : global.browser;
let storage = null;

browser.storage.local.get(`settings`, async result => {
  /**
   *
   * @type {object}
   * @property {boolean} activateTab_sg
   * @property {boolean} activateTab_st
   */
  const settings = result.settings ? JSON.parse(result.settings) : {};
  if (settings.activateTab_sg || settings.activateTab_st) {
    // Get the currently active tab.
    const currentTab = (await queryTabs({active: true}))[0];
    if (settings.activateTab_sg) {
      // Set the SG tab as active.
      await activateTab(`steamgifts`);
    }
    if (settings.activateTab_st) {
      // Set the ST tab as active.
      await activateTab(`steamtrades`);
    }
    // Go back to the previously active tab.  
    if (currentTab && currentTab.id) {
      await updateTab(currentTab.id, {active: true});
    }
  }
  if (settings.notifyNewVersion_sg || settings.notifyNewVersion_st) {
    const url = [];
    if (settings.notifyNewVersion_sg) {
      url.push(`*://*.steamgifts.com/*`);
    }
    if (settings.notifyNewVersion_st) {
      url.push(`*://*.steamtrades.com/*`);
    }
    browser.runtime.onUpdateAvailable.addListener(details => {
      browser.tabs.query({ url }, tabs => {
        const tab = tabs[0];
        if (tab) {
          browser.tabs.sendMessage(tab.id, JSON.stringify({
            action: `update`,
            values: details
          }), () => {
          });
        } else {
          browser.runtime.reload();
        }
      });
    });
  }
});

function sendMessage(action, sender, values) {
  browser.tabs.query({url: [`*://*.steamgifts.com/*`, `*://*.steamtrades.com/*`]}, tabs => {
    tabs.forEach(tab => {
      if (tab.id === sender.tab.id) return;
      browser.tabs.sendMessage(tab.id, JSON.stringify({
        action: action,
        values: values
      }), () => {
      });
    });
  });
}

async function getZip(data, fileName) {
  const zip = new JSZip();
  zip.file(fileName, data);
  return (await zip.generateAsync({
    compression: `DEFLATE`,
    compressionOptions: {
      level: 9
    },
    type: `blob`
  }));
}

async function readZip(data) {
  const zip = new JSZip(),
    /** @property {Object} files */
    contents = await zip.loadAsync(data),
    keys = Object.keys(contents.files),
    output = [];
  for (const key of keys) {
    output.push({
      name: key,
      value: await zip.file(key).async(`string`)
    });
  }
  return output;
}

async function doFetch(parameters, request, sender, callback) {
  if (request.fileName) {
    parameters.body = await getZip(parameters.body, request.fileName);
  }

  let domain = request.url.match(/https?:\/\/(.+?)(\/.*)?$/)[1];
  let url = request.url.match(/(https?:\/\/.+?)(\/.*)?$/)[1];

  // get no-container cookies
  let cookies = await getCookies({
    domain: domain
  });

  const cookieHeader = parameters.headers.get(`Cookie`);
  let setCookies = [];
  if (cookieHeader) {
    setCookies = cookieHeader
      .split(/;\s/)
      .map(x => {
        const parts = x.match(/(.+?)=(.+?)/);
        return {
          name: parts[1],
          url: url,
          value: parts[2]
        };
      })
      .filter(x => x && !cookies.filter(y => x.name === y.name).length);
    for (const cookie of setCookies) {
      await setCookie(cookie);
    }
  }

  if (!request.manipulateCookies) {
    let response = await window.fetch(request.url, parameters);
    let responseText = request.blob
      ? (await readZip(await response.blob()))[0].value
      : await response.text();
    for (const cookie of setCookies) {
      await deleteCookie({
        name: cookie.name,
        url: url
      });
    }
    callback(JSON.stringify({
      finalUrl: response.url,
      redirected: response.redirected,
      responseText: responseText
    }));
    return;
  }
  browser.tabs.get(sender.tab.id, async tab => {
    /**
     * @property {string} tab.cookieStoreId
     */
    if (tab.cookieStoreId === `firefox-default`) {
      let response = await window.fetch(request.url, parameters);
      let responseText = request.blob
        ? (await readZip(await response.blob()))[0].value
        : await response.text();
      for (const cookie of setCookies) {
        await deleteCookie({
          name: cookie.name,
          url: url
        });
      }
      callback(JSON.stringify({
        finalUrl: response.url,
        redirected: response.redirected,
        responseText: responseText
      }));
      return;
    }

    // get container cookies
    let containerCookies = await getCookies({
      domain: domain,
      storeId: tab.cookieStoreId
    });

    // delete no-container cookies
    for (let i = cookies.length - 1; i > -1; i--) {
      let cookie = cookies[i];
      await deleteCookie({
        name: cookie.name,
        url: url
      });
    }
    // set container cookies to no-container scope
    for (let i = containerCookies.length - 1; i > -1; i--) {
      let cookie = containerCookies[i];
      cookie.url = request.url;
      /** @property {boolean} cookie.hostOnly */
      delete cookie.hostOnly;
      delete cookie.session;
      delete cookie.storeId;
      await setCookie(cookie);
    }

    // request
    let response = await fetch(request.url, parameters);
    let responseText = request.blob
      ? (await readZip(await response.blob()))[0].value
      : await response.text();

    // delete container cookies from no-container scope
    for (let i = containerCookies.length - 1; i > -1; i--) {
      let cookie = containerCookies[i];
      await deleteCookie({
        name: cookie.name,
        url: url
      });
    }
    // restore no-container cookies
    for (let i = cookies.length - 1; i > -1; i--) {
      let cookie = cookies[i];
      cookie.url = request.url;
      delete cookie.hostOnly;
      delete cookie.session;
      delete cookie.storeId;
      await setCookie(cookie);
    }

    for (const cookie of setCookies) {
      await deleteCookie({
        name: cookie.name,
        url: url
      });
    }
    callback(JSON.stringify({
      finalUrl: response.url,
      redirected: response.redirected,
      responseText: responseText
    }));
  });
}

function getCookies(details) {
  return new Promise(resolve => {
    browser.cookies.getAll(details, resolve);
  });
}

function setCookie(details) {
  return new Promise(resolve => {
    browser.cookies.set(details, resolve);
  });
}

function deleteCookie(details) {
  return new Promise(resolve => {
    browser.cookies.remove(details, resolve);
  });
}

const locks = {};
const locks_queue = {};

function do_lock(id, key, callback) {
  if (locks[key]) {
    if (!locks_queue[key]) {
      locks_queue[key] = [];
    }
    locks_queue[key].push({
      id,
      is_resolved: false,
      callback
    });
  } else {
    locks[key] = id;
    callback();
  }
} 

function do_unlock(id, key, callback) {
  if (locks[key] === id) {
    let found = false;
    if (locks_queue[key]) {
      for (const item of locks_queue[key]) {
        if (!item.is_resolved) {
          found = true;
          item.is_resolved = true;
          locks[key] = item.id;
          item.callback();
          break;
        }
      }
    }
    if (!found) {
      delete locks[key];
    }
  }
  callback();
}

browser.runtime.onMessage.addListener((request, sender, callback) => {
  let key, keys, parameters, values;
  switch (request.action) {
    case `do_lock`:
      do_lock(request.id, request.key, callback);
      break;
    case `do_unlock`:
      do_unlock(request.id, request.key, callback);
      break;
    case `delValues`:
      keys = JSON.parse(request.keys);
      browser.storage.local.remove(keys, () => {
        keys.forEach(key => {
          delete storage[key];
        });
        sendMessage(`delValues`, sender, keys);
        callback();
      });
      break;
    case `fetch`:
      parameters = JSON.parse(request.parameters);
      parameters.headers = new Headers(parameters.headers);
      // noinspection JSIgnoredPromiseFromCall
      doFetch(parameters, request, sender, callback);
      break;
    case `getStorage`:
      if (storage) {
        callback(JSON.stringify(storage));
      } else {
        browser.storage.local.get(null, stg => {
          storage = stg;
          callback(JSON.stringify(storage));
        });
      }
      break;
    case `reload`:
      browser.runtime.reload();
      callback();
      break;
    case `setValues`:
      values = JSON.parse(request.values);
      browser.storage.local.set(values, () => {
        for (key in values) {
          if (values.hasOwnProperty(key)) {
            storage[key] = values[key];
          }
        }
        sendMessage(`setValues`, sender, values);
        callback();
      });
      break;
    case `tabs`:
      // noinspection JSIgnoredPromiseFromCall
      getTabs(request);
      break;
  }
  return true;
});

async function getTabs(request) {
  let items = [
    {id: `inbox_sg`, pattern: `*://*.steamgifts.com/messages*`, url: `https://www.steamgifts.com/messages`},
    {id: `inbox_st`, pattern: `*://*.steamtrades.com/messages*`, url: `https://www.steamtrades.com/messages`},
    {
      id: `wishlist`,
      pattern: `*://*.steamgifts.com/giveaways/search?*type=wishlist*`,
      url: `https://www.steamgifts.com/giveaways/search?type=wishlist`
    },
    {id: `won`, pattern: `*://*.steamgifts.com/giveaways/won*`, url: `https://www.steamgifts.com/giveaways/won`},
  ];
  let any = false;
  for (let i = 0, n = items.length; i < n; i++) {
    let item = items[i];
    if (!request[item.id]) {
      continue;
    }
    let tab = (await queryTabs({url: item.pattern}))[0];
    if (tab && tab.id) {
      await updateTab(tab.id, {active: true});
      if (request.refresh) {
        browser.tabs.reload(tab.id);
      }
    } else if (request.any) {
      any = true;
    } else {
      window.open(item.url);
    }
  }
  if (any) {
    let tab = (await queryTabs({url: `*://*.steamgifts.com/*`}))[0];
    if (tab && tab.id) {
      await updateTab(tab.id, {active: true});
    }
  }
}

function queryTabs(query) {
  return new Promise(resolve => {
    browser.tabs.query(query, resolve);
  });
}

function updateTab(id, parameters) {
  return new Promise(resolve => {
    browser.tabs.update(id, parameters, resolve);
  });
}

async function activateTab(host) {
  const tab = (await queryTabs({url: `*://*.${host}.com/*`}))[0];
  if (tab && tab.id) {
    await updateTab(tab.id, {active: true});
  }
}