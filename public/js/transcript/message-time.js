/**
 * The time of a user message or of Claude's answer (the item's `at`, lib/sync/item-time.js), shown small and muted in
 * the message's actions row beside the copy button: HH:MM today, with the date on other days; the full local date and
 * time on hover. Nothing when the item has no time. The copy button copies the message's source only (render-items.js).
 */
import { h } from '../dom.js';

const LOCALE = 'he-IL';
const TIME = { hour: '2-digit', minute: '2-digit' };
const DATE = { day: 'numeric', month: 'numeric', year: '2-digit' };
const FULL = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * @param {number} at the message's time in ms @param {Date} [now]
 * @returns {{text:string, title:string}|null} null when `at` is not a time
 * @example messageTimeText(Date.now()) // today: { text: '14:05', title: '<weekday>, 19 בנובמבר 2026 בשעה 14:05:12' }; another day: '18.11.26 09:30'
 */
export function messageTimeText(at, now = new Date()) {
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  const date = new Date(at);
  const time = date.toLocaleTimeString(LOCALE, TIME);
  const text = sameDay(date, now) ? time : `${date.toLocaleDateString(LOCALE, DATE)} ${time}`;
  return { text, title: date.toLocaleString(LOCALE, FULL) };
}

/** @param {object} item a user or text item @returns {HTMLElement|null} the time element, or null when it has no time */
export function messageTime(item) {
  const shown = messageTimeText(item?.at);
  return shown ? h('time', { class: 'msg-time', dir: 'ltr', datetime: new Date(item.at).toISOString(), title: shown.title }, shown.text) : null;
}
