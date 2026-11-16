/**
 * The way other parts of the page (the file menu, the Files pane's editor) show a file in the Preview pane. The pane
 * registers itself; it belongs to the main session only, like every pane.
 */
import { state } from '../state.js';
import { previewKind } from './preview-url.js';

let opener = null;

/** @param {(sessionId:string, path:string)=>void} open the Preview pane's way to show a file */
export function registerPreviewOpener(open) { opener = open; }

/** The pane can show this file: the main session, and a type it previews (html, image, pdf). */
export const canPreview = (sessionId, path) => Boolean(opener) && sessionId === state.activeId && Boolean(previewKind(path));

/** @param {string} sessionId @param {string} path absolute, or relative to the session folder */
export function openPreview(sessionId, path) {
  if (canPreview(sessionId, path)) opener(sessionId, path);
}
