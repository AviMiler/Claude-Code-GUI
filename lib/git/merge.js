/**
 * Merges a worktree session's branch into the branch checked out in the project folder (`git merge --no-ff --no-edit`),
 * the offline replacement for a PR. Takes nothing from the request: branch and folders come from the session. Never
 * pushes, never deletes a branch, never touches the worktree. A conflict is aborted, leaving the project as it was.
 */
const { git } = require('./run');
const { httpError } = require('../http-utils');
const { mergeStatus } = require('./merge-status');
const { withRepoLock } = require('./repo-lock');
const { redact } = require('./push');

const MERGE_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_OUTPUT = 1500;
const trimOutput = text => { const clean = redact(text).trim(); return clean.length > MAX_OUTPUT ? `${clean.slice(0, MAX_OUTPUT)}…` : clean; };
const lines = text => text.split('\n').map(line => line.trim()).filter(Boolean);

/** Conflict: list the files, abort, and say the project is unchanged (or, if the abort failed, that it is not). */
async function conflictFailure(root, target, branch) {
  const unmerged = lines((await git(root, ['diff', '--name-only', '--diff-filter=U'])).stdout);
  const aborted = await git(root, ['merge', '--abort']);
  const list = unmerged.slice(0, 30).map(file => `• ${file}`).join('\n');
  const state = aborted.ok ? `המיזוג בוטל והפרויקט (${target}) נשאר ללא שינוי.`
    : `ביטול המיזוג נכשל: ${trimOutput(aborted.stderr)}\nהרץ git merge --abort בתיקיית הפרויקט.`;
  return httpError(409, `המיזוג של ${branch} אל ${target} יוצר קונפליקטים בקבצים:\n${list}\n${state}`);
}

/**
 * @param {object} session a stored worktree session
 * @returns {Promise<{ok:true, upToDate?:boolean, target:string, branch:string, output:string, merged:number, message?:string}>}
 * @throws httpError 409 with a Hebrew reason (refused by state, conflict, timeout)
 * @example await mergeIntoProject(session) // { ok: true, target: 'main', branch: 'worktree-a', merged: 2, output: 'Merge made by …' }
 */
async function mergeIntoProject(session) {
  const tree = session.worktree;
  if (!tree) throw httpError(409, 'הסשן אינו רץ ב-worktree, ואין ענף למזג.');
  return withRepoLock(tree.root, async () => {
    const status = await mergeStatus(session);
    const { target, branch } = status;
    if (status.upToDate) return { ok: true, upToDate: true, target, branch, output: '', merged: 0, message: status.reason };
    if (!status.canMerge) throw httpError(409, status.reason);
    const result = await git(tree.root, ['merge', '--no-ff', '--no-edit', `refs/heads/${branch}`], { timeoutMs: MERGE_TIMEOUT_MS });
    if (result.ok) return { ok: true, target, branch, merged: status.ahead, output: trimOutput(`${result.stdout}\n${result.stderr}`) };
    const hasConflict = (await git(tree.root, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'])).ok;
    if (result.timedOut) {
      if (hasConflict) await git(tree.root, ['merge', '--abort']);
      throw httpError(409, `המיזוג לא הסתיים תוך ${MERGE_TIMEOUT_MS / 1000} שניות ובוטל. הפרויקט נשאר ללא שינוי.`);
    }
    if (hasConflict) throw await conflictFailure(tree.root, target, branch);
    throw httpError(409, `המיזוג נכשל:\n${trimOutput(`${result.stdout}\n${result.stderr}`)}`);
  });
}

module.exports = { mergeIntoProject, MERGE_TIMEOUT_MS };
