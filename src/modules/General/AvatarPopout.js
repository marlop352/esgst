import { Module } from '../../class/Module';
import { Popout } from '../../class/Popout';
import { utils } from '../../lib/jsUtils';
import { common } from '../Common';
import { gSettings } from '../../class/Globals';
import { shared } from '../../class/Shared';

const
  parseHtml = utils.parseHtml.bind(utils),
  createElements = common.createElements.bind(common),
  request = common.request.bind(common)
  ;

class GeneralAvatarPopout extends Module {
  constructor() {
    super();
    this.info = {
      description: [
        [`ul`, [
          [`li`, `If you click on/hover over (you can decide which one) a user/group's avatar/username, it shows a popout containing all of the basic information that you can find in their page.`]
        ]]
      ],
      id: `ap`,
      name: `Avatar Popout`,
      options: {
        title: `Open on:`,
        values: [`Hover`, `Click`]
      },
      sg: true,
      type: `general`,
      featureMap: {
        endless: this.ap_getAvatars.bind(this),
        user: this.ap_getUsers.bind(this)
      }
    };
  }

  ap_getUsers(users) {
    for (const user of users) {
      if (!user.oldElement.classList.contains(`esgst-ap-avatar`)[0]) {
        this.ap_setAvatar(user.oldElement);
      }
    }
  }

  /**
   * @param context
   * @param [main]
   * @param [source]
   * @param [endless]
   */
  ap_getAvatars(context, main, source, endless) {
    const elements = context.querySelectorAll(`${endless ? `.esgst-es-page-${endless} .global__image-outer-wrap--avatar-small, .esgst-es-page-${endless}.global__image-outer-wrap--avatar-small` : `.global__image-outer-wrap--avatar-small`}, ${endless ? `.esgst-es-page-${endless} .giveaway_image_avatar, .esgst-es-page-${endless}.giveaway_image_avatar` : `.giveaway_image_avatar`}, ${endless ? `.esgst-es-page-${endless} .table_image_avatar, .esgst-es-page-${endless}.table_image_avatar` : `.table_image_avatar`}, ${endless ? `.esgst-es-page-${endless} .featured_giveaway_image_avatar, .esgst-es-page-${endless}.featured_giveaway_image_avatar` : `.featured_giveaway_image_avatar`}, ${endless ? `.esgst-es-page-${endless} .nav__avatar-outer-wrap, .esgst-es-page-${endless}.nav__avatar-outer-wrap` : `.nav__avatar-outer-wrap`}`);
    for (let i = 0, n = elements.length; i < n; ++i) {
      this.ap_setAvatar(elements[i]);
    }
  }

  ap_setAvatar(apAvatar) {
    let delay, eventType, exitTimeout, id, match, onClick, popout, timeout, type, url;
    apAvatar.classList.add(`esgst-ap-avatar`);
    url = apAvatar.getAttribute(`href`);
    if (url) {
      if (gSettings.ap_index === 0) {
        eventType = `mouseenter`;
        onClick = false;
        delay = 1000;
        apAvatar.addEventListener(`mouseleave`, event => {
          if (timeout) {
            window.clearTimeout(timeout);
            timeout = null;
          }
          exitTimeout = window.setTimeout(() => {
            if (popout && !popout.popout.contains(event.relatedTarget)) {
              popout.close();
            }
          }, 1000);
        });
        apAvatar.addEventListener(`click`, () => {
          if (timeout) {
            window.clearTimeout(timeout);
            timeout = null;
          }
        });
      } else {
        eventType = `click`;
        onClick = true;
        delay = 0;
        apAvatar.classList.add(`esgst-clickable`);
      }
      match = url.match(/\/(user|group)\/(.+?)(\/.*)?$/);
      if (match) {
        id = match[2];
        type = match[1];
        apAvatar.addEventListener(eventType, event => {
          event.preventDefault();
          timeout = window.setTimeout(async () => {
            popout = this.esgst.apPopouts[id];
            if (popout) {
              if (gSettings.ap_index === 1 && popout.isOpen) {
                popout.close();
              } else {
                popout.open(apAvatar);
              }
            } else {
              this.esgst.apPopouts[id] = popout = new Popout(`esgst-ap-popout`, null, 1000, onClick);
              createElements(popout.popout, `inner`, [{
                attributes: {
                  class: `fa fa-circle-o-notch fa-spin`
                },
                type: `i`
              }, {
                text: `Loading ${type}...`,
                type: `span`
              }]);
              popout.open(apAvatar);
              let avatar, columns, i, link, n, reportButton, responseHtml, table;
              responseHtml = parseHtml((await request({ method: `GET`, url })).responseText);
              popout.popout.innerHTML = ``;
              popout.popout.appendChild(responseHtml.getElementsByClassName(`featured__outer-wrap`)[0]);
              avatar = popout.popout.getElementsByClassName(`global__image-outer-wrap--avatar-large`)[0];
              link = createElements(avatar, `afterEnd`, [{
                attributes: {
                  class: `esgst-ap-link`
                },
                type: `a`
              }]);
              link.appendChild(avatar);
              link.setAttribute(`href`, url);
              table = popout.popout.getElementsByClassName(`featured__table`)[0];
              responseHtml.getElementsByClassName(`sidebar__shortcut-outer-wrap`)[0].lastElementChild.remove();
              table.parentElement.insertBefore(responseHtml.getElementsByClassName(`sidebar__shortcut-outer-wrap`)[0], table);
              reportButton = popout.popout.getElementsByClassName(`js__submit-form-inner`)[0];
              if (reportButton) {
                const form = reportButton.getElementsByTagName(`form`)[0];
                reportButton.addEventListener(`click`, form.submit.bind(form));
              }
              columns = table.children;
              for (i = 0, n = columns[1].children.length; i < n; ++i) {
                columns[0].appendChild(columns[1].firstElementChild);
              }
              const suspension = responseHtml.getElementsByClassName(`sidebar__suspension`)[0];
              if (suspension) {
                shared.common.createElements_v2(columns[0], `beforeEnd`, [
                  [`div`, { class: `esgst-ap-suspended featured__table__row` }, [
                    [`div`, { class: `featured__table__row__left` }, suspension.textContent],
                    [`div`, { class: `featured__table__row__right` }, suspension.nextElementSibling.textContent]
                  ]]
                ]);
              }
              const elements = responseHtml.querySelectorAll(`.sidebar__navigation__item__name`);
              for (const element of elements) {
                const elementMatch = element.textContent.match(/^Giveaways|Users$/);
                if (elementMatch) {
                  shared.common.createElements_v2(columns[0], `beforeEnd`, [
                    [`div`, { class: `featured__table__row` }, [
                      [`div`, { class: `featured__table__row__left` }, elementMatch[0]],
                      [`div`, { class: `featured__table__row__right` }, element.nextElementSibling.nextElementSibling.textContent]
                    ]]
                  ]);
                }
              }
              columns[1].remove();
              if (type === `user`) {
                await this.esgst.modules.profile.profile_load(popout.popout);
              }
              if (gSettings.at) {
                this.esgst.modules.generalAccurateTimestamp.at_getTimestamps(popout.popout);
              }
              popout.reposition();
            }
            if (gSettings.ap_index === 0) {
              popout.popout.onmouseenter = () => {
                if (exitTimeout) {
                  window.clearTimeout(exitTimeout);
                  exitTimeout = null;
                }
              };
            }
          }, delay);
        });
      }
    }
  }
}

const generalAvatarPopout = new GeneralAvatarPopout();

export { generalAvatarPopout };