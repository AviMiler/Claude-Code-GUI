/**
 * The session worktrees of every project the GUI knows (the cleanup list in settings). The projects are the stored
 * `worktree.root` of the sessions, never anything from a request; only entries under <root>/.claude/worktrees count.
 */
const fs = require('fs');
const path = require('path');
const store = require('../session-store');
const { git } = require('./run');
const { WORKTREES_DIR, samePathKey } = require('./worktree-paths');
const { commitsAhead } = require('./merge-status');

/** @param {string} output `git worktree list --porcelain` @returns {{path:string, branch:string, locked:boolean, prunable:boolean}[]} */
function parseWorktrees(output) {
  return output.split(/\r?\n\r?\n/).map(block => {
    const lines = block.split(/\r?\n/);
    const field = name => lines.find(line => line.startsWith(`${name} `))?.slice(name.length + 1);
    const branch = field('branch');
    return { path: field('worktree'), branch: branch ? branch.replace(/^refs\/heads\//, '') : '', locked: lines.some(line => /^locked\b/.test(line)), prunable: lines.some(line => /^prunable\b/.test(line)) };
  }).filter(entry => entry.path);
}

/** Lexical containment is enough here: git prints the paths it created, and removal re-checks real paths. */
function isUnder(dir, target) {
  const relative = path.relative(samePathKey(dir), samePathKey(target));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** live: a session that is not archived uses the folder; archived: only archived ones; none: no session. */
function ownerOf(target) {
  const owners = store.list().filter(session => session.worktree && samePathKey(session.worktree.path) === samePathKey(target));
  const live = owners.find(session => !session.archived);
  const owner = live || owners[0];
  return { owner: live ? 'live' : owner ? 'archived' : 'none', ownerName: owner?.name || '' };
}

async function describe(root, entry) {
  const exists = fs.existsSync(entry.path);
  const status = exists ? await git(entry.path, ['status', '--porcelain']) : null;
  const dirty = Boolean(status && (!status.ok || status.stdout.trim()));
  const owner = ownerOf(entry.path);
  const reason = owner.owner === 'live' ? 'סשן פעיל משתמש בתיקייה' : dirty ? 'יש שינויים לא שמורים' : entry.locked ? 'ה-worktree נעול ב-git' : '';
  return { root, path: entry.path, branch: entry.branch, exists, dirty, locked: entry.locked, ...owner,
    ahead: entry.branch ? await commitsAhead(root, entry.branch) : null, removable: !reason, reason };
}

/** The entries of one project root, fresh from git. */
async function listRoot(root) {
  const listed = await git(root, ['worktree', 'list', '--porcelain']);
  if (!listed.ok) return [];
  const own = parseWorktrees(listed.stdout).filter(entry => isUnder(path.join(root, WORKTREES_DIR), entry.path));
  return Promise.all(own.map(entry => describe(root, entry)));
}

/**
 * @returns {Promise<{projects:{root:string, worktrees:object[]}[]}>} one group per stored project root that still exists
 * @example await listWorktrees() // { projects: [{ root: 'C:/p', worktrees: [{ path, branch, owner: 'archived', ahead: 2, dirty: false, removable: true, … }] }] }
 */
async function listWorktrees() {
  const roots = new Map();
  for (const session of store.list()) if (session.worktree?.root) roots.set(samePathKey(session.worktree.root), session.worktree.root);
  const projects = [];
  for (const root of roots.values()) {
    if (fs.existsSync(root)) projects.push({ root, worktrees: await listRoot(root) });
  }
  return { projects: projects.filter(project => project.worktrees.length) };
}

module.exports = { listWorktrees, listRoot, parseWorktrees };
