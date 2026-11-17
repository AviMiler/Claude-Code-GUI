/** "Merge into the project branch" for a worktree session: the confirmation (both branches and the commits count), the call and its outcome. */
import { api } from '../api.js';
import { ask } from '../ui.js';

// ⁨…⁩ isolate the Latin branch names, so the Hebrew sentence does not reorder their parts.
const iso = text => `⁨${text}⁩`;

/**
 * @param {string} id the session @param {{branch:string, target:string, ahead:number}} status from api.mergeStatus
 * @returns {Promise<{type:'ok'|'error', text:string}|null>} null: the user cancelled
 */
export async function confirmAndMerge(id, status) {
  const yes = await ask({
    title: 'למזג לענף הפרויקט?',
    text: `${status.ahead} commits מהענף ${iso(status.branch)} ימוזגו לענף ${iso(status.target)} בתיקיית הפרויקט (git merge --no-ff).\n`
      + 'אין push, הענפים נשמרים. אם יש קונפליקט המיזוג מבוטל והפרויקט נשאר כמו שהיה.',
    confirmLabel: 'מיזוג',
  });
  if (!yes) return null;
  try {
    const result = await api.mergeBranch(id);
    return { type: 'ok', text: result.upToDate ? result.message : `${result.merged} commits מוזגו מ-${iso(result.branch)} אל ${iso(result.target)}.` };
  } catch (error) {
    return { type: 'error', text: error.message };
  }
}

/**
 * Before archiving a worktree session (archiving removes the worktree folder; the branch stays): offers the merge when there is one to do.
 * @returns {Promise<{type:string, text:string}|null>} the outcome of a merge the user chose, else null (archive goes on either way)
 */
export async function offerMergeBeforeArchive(session) {
  if (!session.worktree) return null;
  const status = await api.mergeStatus(session.id).catch(() => null);
  if (!status?.canMerge) return null;
  const merge = await ask({
    title: 'למזג לפני הארכיון?',
    text: `בענף ${iso(status.branch)} יש ${status.ahead} commits שלא מוזגו לענף ${iso(status.target)}. הענף נשמר גם אחרי הארכיון.`,
    confirmLabel: 'מיזוג וארכוב', cancelLabel: 'ארכוב בלי מיזוג',
  });
  if (!merge) return null;
  try {
    const result = await api.mergeBranch(session.id);
    return { type: 'ok', text: `${result.merged} commits מוזגו אל ${iso(result.target)}.` };
  } catch (error) {
    return { type: 'error', text: error.message };
  }
}
