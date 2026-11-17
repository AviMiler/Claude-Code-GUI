/**
 * The unread mark of a session. A finished turn the user has not seen is kept on the server (`markedUnread`), so it survives
 * a reload and shows in every open tab; `state.unread` is this tab's quick copy that drives the notifications.
 */
import { api } from '../api.js';
import { state } from '../state.js';

const quiet = () => {}; // a mark that fails to save is not worth an error popup

/** A turn finished out of sight: marks it here and on the server. @param {string} id */
export function markUnseen(id) {
  state.unread.add(id);
  api.updateSession(id, { markedUnread: true }).catch(quiet);
}

/**
 * The session is on screen: clears the mark here, and on the server when it is set there.
 * @param {string|null} id @returns {boolean} something was cleared
 */
export function markSeen(id) {
  if (!id) return false;
  const was = state.unread.delete(id);
  const session = state.sessions.get(id);
  if (session?.markedUnread) {
    session.markedUnread = false;
    api.updateSession(id, { markedUnread: false }).catch(quiet);
    return true;
  }
  return was;
}

/** The "mark as read / unread" menu item. @param {string} id @param {boolean} unread */
export function setUnread(id, unread) {
  if (!unread) state.unread.delete(id);
  return api.updateSession(id, { markedUnread: unread });
}
