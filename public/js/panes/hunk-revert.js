/**
 * The Changes pane's per-hunk "ביטול השינוי" button: asks first (the GUI has no undo), then the server rebuilds the
 * diff itself and reverts that one hunk in the working tree. The request names the hunk only (path, index, fingerprint).
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { confirmRisk } from '../risk.js';
import { hunkHash } from './hunk-hash.js';
import { invalidateSessionFetches } from './session-fetch.js';

let busy = false; // one revert at a time (a double click must not send the next hunk's index with an old diff)

/** Hunks the server can revert: a tracked file's text change (not a new file: an untracked one has
 * no older version and a staged one is refused by the server; not binary or renamed). A deleted file's hunk restores it. */
const revertable = file => !file.binary && !file.oldPath && file.status !== 'renamed' && file.status !== 'added';

/**
 * @param {import('./diff-parse.js').DiffFile} file @param {import('./diff-parse.js').DiffHunk} hunk @param {number} index
 * @param {{sessionId:string, onDone:()=>void}} options onDone: after a try (done or refused), so the pane fetches again
 * @returns {HTMLElement|null} null when this hunk cannot be reverted
 */
export function revertHunkButton(file, hunk, index, { sessionId, onDone }) {
  if (!revertable(file)) return null;
  return h('button', { type: 'button', class: 'diff-hunk-revert', title: 'ביטול השינוי הזה בקובץ (אין אפשרות לשחזר)', onClick: async event => {
    event.stopPropagation();
    if (busy) return;
    busy = true;
    try {
      await confirmRisk('ביטול השינוי', [`החלק הזה ב-${file.path} יחזור לגרסה שב-commit האחרון.`,
        'אין "בטל" בממשק: השינוי יימחק מהקובץ. (Claude לא יקבל הודעה על כך.)'], 'ביטול השינוי');
    } catch {
      busy = false; // the user said no
      return;
    }
    try {
      await api.revertHunk(sessionId, { path: file.path, index, hash: hunkHash(hunk) });
      toast('השינוי בוטל');
    } catch (error) {
      toast(error.message, 'error');
    }
    busy = false;
    invalidateSessionFetches(sessionId); // the pane and the rail fetch again (also after a "changed since" refusal)
    onDone();
  } }, icon('history'), h('span', null, 'ביטול השינוי'));
}
