/** Removes a session's worktree folder when the user asks (deleting the session); its branch always stays. */
const fs = require('fs');
const path = require('path');
const { git } = require('./run');
const { WORKTREES_DIR, listedWorktrees, samePathKey, gitError } = require('./worktree-paths');

const REMOVE_TIMEOUT_MS = 60000;
const LOCK_RETRIES = 5; // Windows keeps the folder locked for a moment after the session's CLI exits
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Inside <root>/.claude/worktrees, by real paths (a symlink cannot point the removal elsewhere). */
function isUnderWorktrees(target, root) {
  try {
    const relative = path.relative(fs.realpathSync(path.join(root, WORKTREES_DIR)), fs.realpathSync(target));
    return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

/**
 * `git worktree remove` without --force: uncommitted changes keep the folder (git refuses). Files git ignores
 * (node_modules, .env) go with it. Only a path stored on the session reaches here, never one from a request.
 * @param {{path:string, root:string}} worktree as stored on the session
 * @returns {Promise<{removed:boolean, error?:string}>}
 */
async function removeWorktree({ path: target, root }) {
  if (!fs.existsSync(target)) {
    await git(root, ['worktree', 'prune']); // deleted by hand: only git's record is left
    return { removed: true };
  }
  if (!isUnderWorktrees(target, root)) return { removed: false, error: 'הנתיב אינו בתיקיית ה-worktrees של המאגר.' };
  if (!(await listedWorktrees(root)).includes(samePathKey(target))) return { removed: false, error: 'git אינו מכיר את ה-worktree הזה.' };
  let result = null;
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt++) {
    result = await git(root, ['worktree', 'remove', target], { timeoutMs: REMOVE_TIMEOUT_MS });
    if (result.ok) return { removed: true };
    if (!/denied|busy|being used|resource|Invalid argument/i.test(result.stderr)) break;
    await sleep(500);
  }
  if (/modified or untracked files/.test(result.stderr)) return { removed: false, error: 'יש בו שינויים או קבצים חדשים שלא נשמרו ב-commit.' };
  return { removed: false, error: gitError(result.stderr) };
}

module.exports = { removeWorktree };
