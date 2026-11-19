/**
 * A link to one session (session-hash.js): copied from the sidebar row menu and the topbar "עוד" menu; opened on load
 * (it wins over the session remembered in localStorage, load-state.js) and when the address's hash changes. The hash is
 * cleared once read, so a reload restores from localStorage and the browser history does not pile up.
 */
import { copyText } from '../dom.js';
import { toast } from '../ui.js';
import { state } from '../state.js';
import { isSessionHash, sessionFromHash, sessionLink } from './session-hash.js';

/** Copies the session's link to the clipboard. @param {string} id */
export async function copySessionLink(id) {
  await copyText(sessionLink(location, id));
  toast('הקישור הועתק');
}

/**
 * Opens the session the address names, if it names one, and clears the hash.
 * @param {(id:string)=>void} selectSession the normal way to open a session (its items load through sync/item-sync.js)
 * @returns {boolean} true when it opened one; false when the address names none, or one that is not known ("הסשן לא נמצא")
 */
export function openSessionLink(selectSession) {
  if (!isSessionHash(location.hash)) return false;
  const id = sessionFromHash(location.hash);
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  if (id && state.sessions.has(id)) { selectSession(id); return true; }
  toast('הסשן לא נמצא', 'error');
  return false;
}

/** A link pasted into a tab that is already open. @param {(id:string)=>void} selectSession */
export function watchSessionLinks(selectSession) {
  window.addEventListener('hashchange', () => openSessionLink(selectSession));
}
