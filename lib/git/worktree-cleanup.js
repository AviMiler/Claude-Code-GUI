/** Removes one worktree folder from the cleanup list. The path is only compared with a fresh list; git does the removing. */
const { httpError } = require('../http-utils');
const { withRepoLock } = require('./repo-lock');
const { removeWorktree } = require('./worktree-remove');
const { samePathKey } = require('./worktree-paths');
const { listWorktrees, listRoot } = require('./worktree-list');

/**
 * Accepts `target` only when it is exactly an entry of the fresh list, re-checks that entry under the repository
 * lock, then reuses removeWorktree (no --force, the branch stays).
 * @param {unknown} target the path from the request
 * @returns {Promise<{ok:true, branch:string, path:string}>}
 * @throws httpError 400 not a path, 404 not an entry of the list, 409 in use / unsaved changes / git refused
 */
async function removeListedWorktree(target) {
  if (typeof target !== 'string' || !target) throw httpError(400, 'חסר נתיב של worktree.');
  const key = samePathKey(target);
  const found = (await listWorktrees()).projects.find(project => project.worktrees.some(entry => samePathKey(entry.path) === key));
  if (!found) throw httpError(404, 'התיקייה אינה ברשימת ה-worktrees של GUI. רענן את הרשימה.');
  return withRepoLock(found.root, async () => {
    const entry = (await listRoot(found.root)).find(item => samePathKey(item.path) === key);
    if (!entry) throw httpError(404, 'ה-worktree כבר לא קיים. רענן את הרשימה.');
    if (!entry.removable) throw httpError(409, `אי אפשר להסיר: ${entry.reason}.`);
    const result = await removeWorktree({ path: entry.path, root: found.root });
    if (!result.removed) throw httpError(409, result.error || 'ההסרה נכשלה.');
    return { ok: true, branch: entry.branch, path: entry.path };
  });
}

module.exports = { removeListedWorktree };
