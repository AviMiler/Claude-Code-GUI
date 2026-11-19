// The worktree cleanup list against scratch repositories with real `git worktree add`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-wtlist-'));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
Object.assign(process.env, { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' });
const store = require('../lib/session-store');
const { listWorktrees } = require('../lib/git/worktree-list');
const { removeListedWorktree } = require('../lib/git/worktree-cleanup');
const { restoreWorktree } = require('../lib/git/worktree');

test.after(() => { fs.rmSync(scratch, { recursive: true, force: true }); });
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let counter = 0;

/** A project on main plus a worktree under .claude/worktrees (branch `b<n>`) and a session that stores it. */
function setup({ archived = false, session = true } = {}) {
  const n = ++counter;
  const root = path.join(scratch, `project${n}`);
  fs.mkdirSync(root);
  sh(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
  sh(root, 'add', '.');
  sh(root, 'commit', '-q', '-m', 'init');
  const tree = path.join(root, '.claude', 'worktrees', `w${n}`);
  sh(root, 'worktree', 'add', '-q', '-b', `b${n}`, tree, 'HEAD');
  const stored = { path: tree, branch: `b${n}`, root, source: root };
  if (session) store.update(store.create({ name: `s${n}`, cwd: tree, mode: 'default', worktree: stored }).id, { archived });
  return { root, tree, branch: `b${n}`, stored };
}
const entryOf = async tree => (await listWorktrees()).projects.flatMap(p => p.worktrees).find(e => path.resolve(e.path).toLowerCase() === path.resolve(tree).toLowerCase());

test('lists only worktrees under .claude/worktrees, with owner, ahead and state', async () => {
  const { root, tree, branch } = setup({ archived: true });
  const outside = path.join(scratch, 'elsewhere');
  sh(root, 'worktree', 'add', '-q', '-b', 'other', outside, 'HEAD');
  fs.writeFileSync(path.join(tree, 'a.txt'), 'a\n');
  sh(tree, 'add', '.');
  sh(tree, 'commit', '-q', '-m', 'a');
  const project = (await listWorktrees()).projects.find(p => path.resolve(p.root) === path.resolve(root));
  assert.strictEqual(project.worktrees.length, 1); // neither the main checkout nor the one outside
  const entry = project.worktrees[0];
  assert.deepStrictEqual([entry.branch, entry.owner, entry.ahead, entry.dirty, entry.removable], [branch, 'archived', 1, false, true]);
});

test('an unowned worktree is listed as none and a live session blocks removal', async () => {
  const unowned = setup({ session: false });
  const live = setup();
  assert.strictEqual(await entryOf(unowned.tree), undefined); // a repository no session references is not listed
  assert.strictEqual((await entryOf(live.tree)).owner, 'live');
  await assert.rejects(removeListedWorktree(live.tree), error => error.status === 409 && /סשן פעיל/.test(error.message));
  assert.ok(fs.existsSync(live.tree));
});

test('a worktree of a referenced project without its own session shows owner none', async () => {
  const first = setup();
  const second = path.join(first.root, '.claude', 'worktrees', 'extra');
  sh(first.root, 'worktree', 'add', '-q', '-b', 'extra', second, 'HEAD');
  assert.strictEqual((await entryOf(second)).owner, 'none');
  assert.deepStrictEqual(await removeListedWorktree(second).then(r => [r.ok, r.branch]), [true, 'extra']);
  assert.strictEqual(sh(first.root, 'rev-parse', '--verify', 'extra').length, 40); // branch kept
});

test('unsaved changes (also an untracked file) refuse removal', async () => {
  const { tree } = setup({ archived: true });
  fs.writeFileSync(path.join(tree, 'new.txt'), 'x\n');
  const entry = await entryOf(tree);
  assert.deepStrictEqual([entry.dirty, entry.removable, entry.reason], [true, false, 'יש שינויים לא שמורים']);
  await assert.rejects(removeListedWorktree(tree), error => error.status === 409 && /שינויים לא שמורים/.test(error.message));
  assert.ok(fs.existsSync(tree));
});

test('a path that is not an entry of the fresh list is refused', async () => {
  const { root } = setup({ archived: true });
  for (const target of [root, path.join(root, '.claude', 'worktrees', 'nope'), path.join(scratch, 'whatever'), '', 5, undefined]) {
    await assert.rejects(removeListedWorktree(target), error => [400, 404].includes(error.status));
  }
  assert.ok(fs.existsSync(root));
});

test('removal keeps the branch and an archived session can be restored afterwards', async () => {
  const { root, tree, branch, stored } = setup({ archived: true });
  const result = await removeListedWorktree(tree);
  assert.deepStrictEqual([result.ok, result.branch], [true, branch]);
  assert.ok(!fs.existsSync(tree));
  assert.strictEqual(sh(root, 'rev-parse', '--verify', `refs/heads/${branch}`).length, 40);
  assert.strictEqual(await entryOf(tree), undefined);
  await restoreWorktree(stored);
  assert.ok(fs.existsSync(path.join(tree, 'base.txt')));
});
