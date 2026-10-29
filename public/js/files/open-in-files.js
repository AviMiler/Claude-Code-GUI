/**
 * The way other parts of the page (the file viewer, the file menu) open a file in the Files pane. The pane registers
 * itself; without it, or for a session that is not the main one, those parts offer only the read-only viewer.
 */
import { state } from '../state.js';

let opener = null;

/** @param {(sessionId:string, path:string)=>void} open the Files pane's way to show a file */
export function registerFilesOpener(open) { opener = open; }

/** The pane can show a file of this session: it is the main one (the pane area belongs to it). */
export const canOpenInFiles = sessionId => Boolean(opener) && sessionId === state.activeId;

export function openInFiles(sessionId, path) {
  if (canOpenInFiles(sessionId)) opener(sessionId, path);
}
