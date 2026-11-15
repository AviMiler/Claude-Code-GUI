/**
 * The "try again" and "compare" buttons on the last answer of the main thread, and the same two entries in its
 * context menu. One observer keeps the buttons on the latest answer (they move as new answers arrive); one click
 * listener for the list. Hidden when the last user message is not a rewind point or the session works.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { state, activeSession } from '../state.js';
import { openContextMenu, hasSelection } from '../context-menu/menu.js';
import { lastPoint } from './last-turn.js';
import { retryLast } from './retry-flow.js';
import { compareLast } from '../compare/compare-flow.js';
import { pickCompare } from '../compare/compare-picker.js';

const TIP_RETRY = 'נסה שוב: חזרה בשיחה לפני ההודעה האחרונה ושליחה מחדש. הקבצים לא יוחזרו.';
const TIP_COMPARE = 'השווה: ענף של השיחה, בחלון המפוצל, עם מודל או רמת מאמץ אחרים';
const button = (kind, title, glyph) => h('button', { type: 'button', class: `icon-button retry-button ${kind}-button`, title, 'aria-label': title, dataset: { [kind]: '' } }, icon(glyph));

/** @param {HTMLElement} messages the main thread's list @param {{actions:object, composer:{restore:Function}}} deps */
export function enableRetry(messages, { actions, composer }) {
  const retry = () => retryLast(activeSession(), actions, composer);
  const compare = async () => {
    const session = activeSession();
    const settings = session && lastPoint(session) && await pickCompare();
    if (settings) compareLast(session, settings, actions);
  };
  const lastWrap = () => [...messages.querySelectorAll('.msg-assistant-wrap')].pop();
  const place = () => {
    const target = lastPoint(activeSession()) && lastWrap()?.querySelector('.msg-actions');
    messages.querySelectorAll('.retry-button').forEach(node => { if (!target || node.parentNode !== target) node.remove(); });
    if (target && !target.querySelector('.retry-button')) target.append(button('retry', TIP_RETRY, 'refresh'), button('compare', TIP_COMPARE, 'columns'));
  };
  new MutationObserver(place).observe(messages, { childList: true, subtree: true });
  messages.addEventListener('click', event => {
    if (event.target.closest('[data-retry]')) retry();
    else if (event.target.closest('[data-compare]')) compare();
  });
  messages.addEventListener('contextmenu', event => {
    if (!state.activeId || hasSelection() || event.target.closest('.msg-assistant-wrap') !== lastWrap() || !lastPoint(activeSession())) return;
    event.preventDefault();
    openContextMenu(event, [{ icon: 'refresh', title: 'נסה שוב', onSelect: retry }, { icon: 'columns', title: 'השווה…', onSelect: compare }]);
  });
}
