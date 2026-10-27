/**
 * A git worktree per session (Claude Code Desktop): the session works in its own checkout under
 * <repository>/.claude/worktrees/<name> on its own new branch worktree-<name>, the layout of `claude --worktree`.
 * The worktree starts from the folder's current commit (HEAD; nothing is fetched). Removing it is worktree-remove.js.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { git } = require('./run');
const { mainCheckout, gitError, WORKTREES_DIR } = require('./worktree-paths');

const BRANCH_PREFIX = 'worktree-';
const ADD_TIMEOUT_MS = 180000; // a big checkout on Windows takes a while
const EXCLUDE_LINE = '/.claude/worktrees/';

/**
 * Whether a folder can get a worktree, for the welcome page's toggle.
 * @param {{cwd:string}} options
 * @returns {Promise<{isRepo:boolean, hasCommits?:boolean, branch?:string}>}
 */
async function probeWorktree({ cwd }) {
  if (!await mainCheckout(cwd)) return { isRepo: false };
  const head = await git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const branch = await git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  return { isRepo: true, hasCommits: head.ok, branch: branch.stdout.trim() };
}

/** The chosen folder relative to its checkout's top, by real paths (a symlinked or junction path); '' for the top. */
function subfolderOf(top, cwd) {
  let relative = '';
  try { relative = path.relative(fs.realpathSync(top), fs.realpathSync(cwd)); } catch { /* the top then */ }
  return relative.startsWith('..') || path.isAbsolute(relative) ? '' : relative;
}

/** A short ASCII name (Windows paths are limited): the date and a random part, e.g. 261027-a3f9. */
function newSlug() {
  const day = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `${day}-${crypto.randomBytes(2).toString('hex')}`;
}

/** A name whose folder and branch are both free: `-b` below then never touches an existing branch. */
async function freeName(cwd, base) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = newSlug();
    const target = path.join(base, slug);
    const branch = `${BRANCH_PREFIX}${slug}`;
    const taken = fs.existsSync(target) || (await git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])).ok;
    if (!taken) return { target, branch };
  }
  throw new Error('לא נמצא שם פנוי ל-worktree.');
}

/** A symlink committed at .claude or .claude/worktrees could send the checkout elsewhere (the CLI refuses it too). */
function refuseSymlinks(paths) {
  for (const target of paths) {
    let stat = null;
    try { stat = fs.lstatSync(target); } catch { /* does not exist yet */ }
    if (stat?.isSymbolicLink()) throw new Error(`${target} הוא קיצור דרך (symlink); ה-worktree לא נוצר.`);
  }
}

/** Keeps the worktrees out of the main checkout's status (local .git/info/exclude, never a tracked .gitignore). */
async function excludeWorktrees(root) {
  try {
    const common = (await git(root, ['rev-parse', '--git-common-dir'])).stdout.trim();
    const file = path.join(path.resolve(root, common), 'info', 'exclude');
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (text.split(/\r?\n/).includes(EXCLUDE_LINE)) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}${EXCLUDE_LINE}\n`);
  } catch (error) {
    console.warn('[worktree] cannot write info/exclude:', error.message); // only cosmetic: the session still works
  }
}

/** A failed add can still leave a complete worktree (a failing post-checkout hook): it and its new branch go. */
async function undoAdd(cwd, target, branch) {
  // --force: the folder did not exist before this add, so everything in it came from the add or its hook.
  if (fs.existsSync(target)) await git(cwd, ['worktree', 'remove', '--force', target]);
  await git(cwd, ['worktree', 'prune']);
  await git(cwd, ['branch', '-D', branch]); // created by this add: freeName checked it did not exist
}

/**
 * @param {{cwd:string}} options the folder the user chose; a subfolder of the repository maps to the same subfolder
 * @returns {Promise<{cwd:string, subfolderMissing:boolean, worktree:{path:string, branch:string, root:string, source:string}}>}
 *   cwd: where the session runs; subfolderMissing: that subfolder is not in HEAD, so the worktree's root is used
 * @throws {Error} with a Hebrew message: not a repository, no commit yet, a symlink, or git's own error
 * @example await createWorktree({ cwd: 'C:\\repo\\web' }) // { cwd: 'C:\\repo\\.claude\\worktrees\\261027-a3f9\\web', ... }
 */
async function createWorktree({ cwd }) {
  const root = await mainCheckout(cwd);
  if (!root) throw new Error('התיקייה אינה בתוך מאגר git (או שהמאגר הוא bare).');
  if (!(await git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD'])).ok) throw new Error('במאגר אין עדיין commit, ו-worktree מתחיל מ-commit.');
  const top = (await git(cwd, ['rev-parse', '--show-toplevel'])).stdout.trim();
  const subfolder = subfolderOf(top, cwd);
  const base = path.join(root, WORKTREES_DIR);
  const { target, branch } = await freeName(cwd, base);
  refuseSymlinks([path.join(root, '.claude'), base, target]);
  await excludeWorktrees(root);
  // HEAD of the chosen folder: the commit and branch its session details already show. Uncommitted changes stay behind.
  const added = await git(cwd, ['worktree', 'add', '-b', branch, target, 'HEAD'], { timeoutMs: ADD_TIMEOUT_MS });
  if (!added.ok) {
    const checkedOut = fs.existsSync(target); // the checkout was done, so the repository's post-checkout hook failed
    await undoAdd(cwd, target, branch);
    if (added.timedOut) throw new Error('יצירת ה-worktree ארכה יותר משלוש דקות ובוטלה.');
    throw new Error(checkedOut ? 'ה-hook של המאגר (post-checkout) נכשל, וה-worktree הוסר.' : `יצירת ה-worktree נכשלה: ${gitError(added.stderr)}`);
  }
  const mapped = path.join(target, subfolder);
  const found = Boolean(subfolder) && fs.existsSync(mapped);
  return { cwd: found ? mapped : target, subfolderMissing: Boolean(subfolder) && !found,
    worktree: { path: target, branch, root, source: path.resolve(cwd) } };
}

module.exports = { probeWorktree, createWorktree };
