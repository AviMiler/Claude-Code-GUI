/**
 * The way other parts of the page (the file viewer, the file menu) open a file in the Files pane. The pane registers
 * itself; without it, or for a session that is not the main one, those parts offer only the read-only viewer.
 */
import { state } from '../state.js';
import { api } from '../api.js';

let opener = null;

/** @param {(sessionId:string, path:string)=>void} open the Files pane's way to show a file */
export function registerFilesOpener(open) { opener = open; }

/** The pane can show a file of this session: it is the main one (the pane area belongs to it). */
export const canOpenInFiles = sessionId => Boolean(opener) && sessionId === state.activeId;

export function openInFiles(sessionId, path) {
  if (canOpenInFiles(sessionId)) opener(sessionId, path);
}

const MIN_CHAT = 560; // the pane host's own limits (panes/pane-host.js): the area is hidden below them
const MIN_PANE = 280;

/** The pane area fits beside the chat now (or is already shown). */
function hasRoom() {
  const area = document.getElementById('pane-area');
  if (!area) return false;
  if (!area.hidden) return true;
  let width = 340;
  try { width = Number(JSON.parse(localStorage.getItem('claude-gui.panes-width'))) || width; } catch { /* storage may be blocked */ }
  return area.parentElement.clientWidth >= MIN_CHAT + Math.max(MIN_PANE, width);
}

/** An absolute path that is outside the session's folders (a relative one is left to the server). */
function outsideRoots(session, path) {
  if (!/^([a-z]:|[\\/])/i.test(path)) return false;
  const flat = text => text.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return ![session.cwd, ...(session.addDirs || [])].some(root => (flat(path) + '/').startsWith(`${flat(root)}/`));
}

/**
 * Opens a file in the Files pane when that can work: the main session, room for the pane, inside the session's folders,
 * and a file the editor can load (the server is asked first, so a binary or huge file falls back to the viewer).
 * @param {string} sessionId @param {string} path @returns {Promise<boolean>} false: the caller shows the read-only viewer
 */
export async function tryOpenInFiles(sessionId, path) {
  const session = state.sessions.get(sessionId);
  if (!session || !canOpenInFiles(sessionId) || !hasRoom() || outsideRoots(session, path)) return false;
  try { await api.openFile(sessionId, path); } catch { return false; }
  openInFiles(sessionId, path);
  return true;
}
