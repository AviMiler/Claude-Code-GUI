// The Changes pane's whole-branch view against scratch repositories with a real `git worktree add`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

Object.assign(process.env, { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' });
const { branchDiff, branchInfo } = require('../lib/git/branch-diff');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-branchdiff-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
let counter = 0;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, name, text) => fs.writeFileSync(path.join(root, name), text);
const commitIn = (dir, name, text) => { write(dir, name, text); sh(dir, 'add', '.'); sh(dir, 'commit', '-q', '-m', `add ${name}`); };

function makeSession() {
  const root = path.join(scratch, `project${++counter}`);
  fs.mkdirSync(root);
  sh(root, 'init', '-q', '-b', 'main');
  commitIn(root, 'base.txt', 'base\n');
  const tree = path.join(scratch, `tree${counter}`);
  sh(root, 'worktree', 'add', '-q', '-b', 'wt', tree, 'HEAD');
  return { root, tree, session: { id: `s${counter}`, cwd: tree, worktree: { path: tree, branch: 'wt', root, source: root } } };
}

test('branch view holds committed, uncommitted and untracked changes against the merge base', async () => {
  const { root, tree, session } = makeSession();
  commitIn(tree, 'committed.txt', 'c\n');
  write(tree, 'base.txt', 'base\nedited\n');
  write(tree, 'fresh.txt', 'f\n');
  commitIn(root, 'main-only.txt', 'm\n'); // the project moved on: not part of the branch's own changes
  const result = await branchDiff(session);
  assert.deepStrictEqual([result.isRepo, result.mode, result.target, result.fileStates], [true, 'branch', 'main', undefined]);
  for (const name of ['committed.txt', 'base.txt', 'fresh.txt']) assert.match(result.diff, new RegExp(`diff --git a/${name} b/${name}`));
  assert.doesNotMatch(result.diff, /main-only/);
  assert.deepStrictEqual((await branchInfo(session)), { target: 'main', canCompare: true, reason: '' });
});

test('a detached project HEAD refuses the branch view', async () => {
  const { root, session } = makeSession();
  sh(root, 'checkout', '-q', '--detach');
  const info = await branchInfo(session);
  assert.strictEqual(info.canCompare, false);
  assert.match(info.reason, /מנותק/);
  await assert.rejects(branchDiff(session), error => error.status === 409 && /מנותק/.test(error.message));
});

test('a session without a worktree is refused', async () => {
  const { tree } = makeSession();
  await assert.rejects(branchDiff({ id: 'x', cwd: tree }), error => error.status === 409);
  assert.strictEqual((await branchInfo({ id: 'x', cwd: tree })).canCompare, false);
});
