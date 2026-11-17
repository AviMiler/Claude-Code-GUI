/** The one status dot of a session row. Priority: waiting for approval > error > running > unread. */
import { h } from '../dom.js';

const TITLES = {
  waiting: 'ממתין לאישור שלך', error: 'הריצה האחרונה נכשלה', running: 'Claude עובד', unread: 'יש תשובה חדשה', idle: '',
};

/**
 * @param {object} session
 * @param {Set<string>} unread ids of sessions whose finished turn was not seen in this tab
 * @returns {'waiting'|'error'|'running'|'unread'|'idle'}
 */
export function statusOf(session, unread) {
  if (session.pendingPermissions?.length) return 'waiting';
  const unseen = unread.has(session.id);
  if (unseen && session.lastOutcome === 'error') return 'error';
  if (session.status === 'running') return 'running';
  return unseen || session.markedUnread ? 'unread' : 'idle';
}

/** @returns {HTMLElement} the dot with its Hebrew tooltip (an empty dot keeps the column) */
export function statusDot(status) {
  const title = TITLES[status];
  return h('span', { class: `dot ${status}`, title: title || null, role: title ? 'img' : null, 'aria-label': title || null });
}

/** "Unread" for the filter and the menu: a finished turn not seen in this tab, or marked by hand (stored on the server). */
export const isUnread = (session, unread) => unread.has(session.id) || Boolean(session.markedUnread);

/** "Active" for the filter: running, or waiting for approval. */
export const isActive = session => session.status === 'running' || Boolean(session.pendingPermissions?.length);
