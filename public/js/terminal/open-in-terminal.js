/** The way other parts of the page (the Files tree, the file menu) open a terminal in a folder; the Terminal pane registers itself. */
import { state } from '../state.js';

let opener = null;

/** @param {(sessionId:string, folder:string)=>void} open the Terminal pane's way to show a new terminal in a folder */
export function registerTerminalOpener(open) { opener = open; }

/** The pane can open one: it exists and the session is the main one (the pane area belongs to it). */
export const canOpenInTerminal = sessionId => Boolean(opener) && sessionId === state.activeId;

/** @param {string} sessionId @param {string} folder a folder or file path, absolute or relative to the session's folder (the server validates it) */
export function openInTerminal(sessionId, folder) {
  if (canOpenInTerminal(sessionId)) opener(sessionId, folder);
}
