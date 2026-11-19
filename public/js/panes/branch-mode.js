/**
 * The Changes pane's second view for a worktree session: "כל הענף מול <target>" (everything since the branch left the
 * project's branch) instead of the uncommitted changes. The choice is per session, in browser memory only. In the
 * branch view nothing here edits files: no hunk revert, no file discard, no commit box (the merge box stays).
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { toast } from '../ui.js';
import { revertHunkButton } from './hunk-revert.js';
import { discardFileButton } from './file-discard.js';

const modes = new Map(); // session id -> 'branch'; absent = uncommitted

/** @param {string} id @returns {boolean} whether the session's pane shows the whole branch */
export const inBranchMode = id => modes.get(id) === 'branch';

/**
 * The pane's request: falls back to the uncommitted view (and says so) when the branch view is refused.
 * @param {string} id @returns {Promise<object>}
 * @example const result = await loadDiff(session.id)
 */
export async function loadDiff(id) {
  if (!inBranchMode(id)) return api.sessionDiff(id);
  try {
    return await api.sessionDiff(id, 'branch');
  } catch (error) {
    modes.delete(id);
    toast(error.message, 'error');
    return api.sessionDiff(id);
  }
}

/** @param {object} data the diff answer @returns {boolean} whether it is the whole-branch view */
export const isBranchData = data => data?.mode === 'branch';

/**
 * The toolbar toggle; null when the session is not a worktree session.
 * @param {string} id @param {{branchView?:{target:string|null, canCompare:boolean, reason:string}}} data @param {()=>void} onChange the pane fetches again
 * @returns {HTMLElement|null}
 */
export function branchToggle(id, data, onChange) {
  const view = data.branchView;
  if (!view) return null;
  const pick = branch => { if (branch) modes.set(id, 'branch'); else modes.delete(id); onChange(); };
  const on = isBranchData(data);
  return h('span', { class: 'segmented branch-toggle' },
    h('button', { type: 'button', class: on ? '' : 'on', onClick: () => pick(false) }, 'שינויים לא שמורים'),
    h('button', { type: 'button', class: on ? 'on' : '', disabled: !view.canCompare, title: view.canCompare ? `כל מה שהענף שינה מאז שיצא מ-${view.target}` : view.reason,
      onClick: () => pick(true) }, view.target ? `כל הענף מול ${view.target}` : 'כל הענף'));
}

/**
 * @param {object} data @param {string} id @param {object} diffFile the diff file @param {()=>void} onDone
 * @returns {{hunkAction?:Function, fileAction?:Function}} the edit buttons (none in the branch view)
 * @example renderDiffFile(file, { ...editActions(data, session.id, file, rerender) })
 */
export function editActions(data, id, diffFile, onDone) {
  if (isBranchData(data)) return {};
  return {
    hunkAction: (hunk, index) => revertHunkButton(diffFile, hunk, index, { sessionId: id, onDone }),
    fileAction: (file, head) => discardFileButton(diffFile.path, data.fileStates?.[diffFile.path], head, { sessionId: id, onDone }),
  };
}

/** @param {object} data @returns {string} what the pane says when no file changed */
export function emptyText(data) {
  return isBranchData(data) ? 'אין הבדלים מול הענף.' : 'אין שינויים שלא נשמרו ב-commit.';
}

/** @param {object} data @param {{element:(session:object)=>HTMLElement}} commitBox @param {object} session @returns {HTMLElement|null} the commit box (none in the branch view) */
export function commitBoxFor(data, commitBox, session) {
  return isBranchData(data) ? null : commitBox.element(session);
}
