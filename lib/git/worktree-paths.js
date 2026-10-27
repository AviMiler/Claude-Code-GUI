/** Where a repository keeps its session worktrees, and which checkout is its main one (worktree.js, worktree-remove.js). */
const path = require('path');
const { git } = require('./run');

const WORKTREES_DIR = path.join('.claude', 'worktrees');

/**
 * The repository's main checkout, also from inside a linked worktree (a new worktree must not nest in another).
 * @returns {Promise<string|null>} null outside a repository or for a bare one
 */
async function mainCheckout(cwd) {
  const list = await git(cwd, ['worktree', 'list', '--porcelain']);
  if (!list.ok) return null;
  const main = list.stdout.split(/\r?\n\r?\n/)[0]; // the main worktree is listed first
  const match = main.match(/^worktree (.+)$/m);
  return match && !/^bare$/m.test(main) ? path.resolve(match[1]) : null;
}

/** The worktree paths git knows, normalized for comparing. */
async function listedWorktrees(root) {
  const list = await git(root, ['worktree', 'list', '--porcelain']);
  return list.stdout.split(/\r?\n/).filter(line => line.startsWith('worktree ')).map(line => samePathKey(line.slice(9)));
}

/** Paths compare case-insensitively on Windows; git prints them with forward slashes there. */
const samePathKey = target => (process.platform === 'win32' ? path.resolve(target).toLowerCase() : path.resolve(target));

/** The line of git's output that says what failed: its last "fatal:" or "error:" line, else its last line. */
function gitError(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  return lines.filter(line => /^(fatal|error):/.test(line)).pop() || lines.pop() || 'שגיאה לא ידועה';
}

module.exports = { WORKTREES_DIR, mainCheckout, listedWorktrees, samePathKey, gitError };
