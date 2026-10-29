/**
 * What the Files pane remembers per session, in browser memory (like the Changes pane's comments): the open file with its
 * draft, which folders are open in the tree, and whether tool and dependency folders are shown.
 */

/** @typedef {{file:object|null, draft:string, conflict:boolean, saving:boolean, expanded:Set<string>, showHidden:boolean}} FilesState */

const states = new Map();

/** @returns {FilesState} */
export function filesState(sessionId) {
  if (!states.has(sessionId)) states.set(sessionId, { file: null, draft: '', conflict: false, saving: false, expanded: new Set(), showHidden: false });
  return states.get(sessionId);
}

export const isDirty = state => Boolean(state.file) && state.draft !== state.file.content;

/** Any session with an edit that was not saved (the page asks before it closes). */
export const anyDirty = () => [...states.values()].some(isDirty);
