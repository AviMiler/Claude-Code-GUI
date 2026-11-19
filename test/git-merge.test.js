// "Merge into the project branch" against scratch repositories with a real `git worktree add`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

Object.assign(process.env, { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' });
const { mergeIntoProject } = require('../lib/git/merge');
const { mergeStatus } = require('../lib/git/merge-status');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-merge-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
let counter = 0;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, name, text) => fs.writeFileSync(path.join(root, name), text);
const rejects = (promise, pattern) => assert.rejects(promise, error => { assert.strictEqual(error.status, 409); assert.match(error.message, pattern); return true; });

/** A project on main with one commit and a worktree on branch wt; returns the session shape the server stores. */
function makeSession() {
  const root = path.join(scratch, `project${++counter}`);
  fs.mkdirSync(root);
  sh(root, 'init', '-q', '-b', 'main');
  write(root, 'base.txt', 'base\n');
  sh(root, 'add', '.');
  sh(root, 'commit', '-q', '-m', 'init');
  const tree = path.join(scratch, `tree${counter}`);
  sh(root, 'worktree', 'add', '-q', '-b', 'wt', tree, 'HEAD');
  return { root, tree, session: { id: `s${counter}`, cwd: tree, archived: false, worktree: { path: tree, branch: 'wt', root, source: root } } };
}
const commitIn = (dir, name, text, message = `add ${name}`) => { write(dir, name, text); sh(dir, 'add', '.'); sh(dir, 'commit', '-q', '-m', message); };

test('merges the session branch into the project branch with a merge commit', async () => {
  const { root, tree, session } = makeSession();
  commitIn(tree, 'a.txt', 'a\n');
  commitIn(tree, 'b.txt', 'b\n');
  const status = await mergeStatus(session);
  assert.deepStrictEqual([status.canMerge, status.ahead, status.target, status.branch], [true, 2, 'main', 'wt']);
  const result = await mergeIntoProject(session);
  assert.deepStrictEqual([result.ok, result.target, result.branch, result.merged], [true, 'main', 'wt', 2]);
  assert.strictEqual(sh(root, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 3); // a merge commit: two parents
  assert.ok(fs.existsSync(path.join(root, 'a.txt')));
  assert.strictEqual(sh(root, 'rev-parse', '--verify', 'wt').length, 40); // branch kept
  assert.strictEqual((await mergeIntoProject(session)).upToDate, true); // and now nothing is left to merge
});

test('a worktree with uncommitted changes is refused', async () => {
  const { root, tree, session } = makeSession();
  commitIn(tree, 'a.txt', 'a\n');
  write(tree, 'dirty.txt', 'x\n');
  const head = sh(root, 'rev-parse', 'HEAD');
  await rejects(mergeIntoProject(session), /שלא נשמרו.*Commit/);
  assert.strictEqual(sh(root, 'rev-parse', 'HEAD'), head);
});

test('a project with uncommitted changes is refused', async () => {
  const { root, tree, session } = makeSession();
  commitIn(tree, 'a.txt', 'a\n');
  write(root, 'base.txt', 'changed\n');
  await rejects(mergeIntoProject(session), /תיקיית הפרויקט.*שלא נשמרו/);
  assert.strictEqual(fs.readFileSync(path.join(root, 'base.txt'), 'utf8'), 'changed\n');
});

test('a conflict is aborted, the project is unchanged and the file is listed', async () => {
  const { root, tree, session } = makeSession();
  commitIn(tree, 'base.txt', 'from worktree\n');
  commitIn(root, 'base.txt', 'from project\n');
  const head = sh(root, 'rev-parse', 'HEAD');
  await rejects(mergeIntoProject(session), /base\.txt[\s\S]*נשאר ללא שינוי/);
  assert.strictEqual(sh(root, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(sh(root, 'status', '--porcelain'), '');
  assert.strictEqual(fs.existsSync(path.join(root, '.git', 'MERGE_HEAD')), false);
});

test('up to date: a message, not an error', async () => {
  const { session } = makeSession();
  const result = await mergeIntoProject(session);
  assert.deepStrictEqual([result.ok, result.upToDate, result.merged], [true, true, 0]);
  assert.match(result.message, /אין מה למזג/);
});

test('refused: not a worktree session, archived, target equals the session branch, detached project', async () => {
  await rejects(mergeIntoProject({ id: 'x', cwd: scratch, worktree: null }), /אינו רץ ב-worktree/);
  const { root, tree, session } = makeSession();
  commitIn(tree, 'a.txt', 'a\n');
  await rejects(mergeIntoProject({ ...session, archived: true }), /בארכיון/);
  sh(root, 'checkout', '-q', '--detach');
  await rejects(mergeIntoProject(session), /HEAD מנותק/);
  const second = makeSession();
  assert.strictEqual((await mergeStatus({ ...second.session, worktree: { ...second.session.worktree, path: second.root, branch: 'main' } })).canMerge, false);
});

test('an untracked project file the merge would overwrite is refused in Hebrew and the project is unchanged', async () => {
  const { root, tree, session } = makeSession();
  commitIn(tree, 'clash.txt', 'from branch\n');
  write(root, 'clash.txt', 'untracked in project\n');
  const head = sh(root, 'rev-parse', 'HEAD');
  await rejects(mergeIntoProject(session), /היה דורס[\s\S]*clash\.txt[\s\S]*ללא שינוי/);
  assert.strictEqual(sh(root, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(fs.readFileSync(path.join(root, 'clash.txt'), 'utf8'), 'untracked in project\n');
});
