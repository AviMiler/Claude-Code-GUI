// Commit / push of the Changes pane against scratch repositories (a local bare repository is "origin").
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

Object.assign(process.env, { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' });
const { parsePorcelain, commitStatus } = require('../lib/git/commit-status');
const { commitChanges } = require('../lib/git/commit');
const { pushBranch } = require('../lib/git/push');
const { withRepoLock } = require('../lib/git/repo-lock');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-commit-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
let counter = 0;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, name, text = 'x\n') => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), text); };

/** A repository with one commit; withOrigin: pushed to a bare "origin" (upstream set). */
function makeRepo({ withOrigin = false } = {}) {
  const root = path.join(scratch, `repo${++counter}`);
  fs.mkdirSync(root);
  sh(root, 'init', '-q', '-b', 'main');
  write(root, 'base.txt', 'base\n');
  sh(root, 'add', '.');
  sh(root, 'commit', '-q', '-m', 'init');
  if (withOrigin) {
    const bare = path.join(scratch, `origin${counter}.git`);
    sh(scratch, 'init', '-q', '--bare', bare);
    sh(root, 'remote', 'add', 'origin', bare);
    sh(root, 'push', '-q', '-u', 'origin', 'main');
  }
  return { root, session: { cwd: root } };
}
const rejects = (promise, status, pattern) => assert.rejects(promise, error => { assert.strictEqual(error.status, status); if (pattern) assert.match(error.message, pattern); return true; });

test('parsePorcelain reads renames, untracked files and odd names', () => {
  const files = parsePorcelain('R  new name.txt\0old.txt\0 M -dash.txt\0?? שלום.txt\0D  gone.txt\0');
  assert.deepStrictEqual(files.map(file => [file.path, file.oldPath, file.staged, file.untracked]),
    [['new name.txt', 'old.txt', true, false], ['-dash.txt', undefined, false, false], ['שלום.txt', undefined, false, true], ['gone.txt', undefined, true, false]]);
});

test('status: not a repository, clean, ahead, no upstream', async () => {
  assert.strictEqual((await commitStatus({ cwd: scratch })).isRepo, false);
  const { root } = makeRepo();
  let status = await commitStatus({ cwd: root });
  assert.strictEqual(status.canCommit, false);
  assert.match(status.commitReason, /אין שינויים/);
  assert.match(status.pushReason, /upstream/);
  assert.strictEqual(status.canPushNewUpstream, false); // no origin
  const origin = makeRepo({ withOrigin: true });
  write(origin.root, 'a.txt');
  sh(origin.root, 'add', '.');
  sh(origin.root, 'commit', '-q', '-m', 'second');
  status = await commitStatus({ cwd: origin.root });
  assert.strictEqual(status.ahead, 1);
  assert.strictEqual(status.canPush, true);
  assert.strictEqual(status.upstream, 'origin/main');
});

test('commits exactly the chosen files, with names that look like options or globs', async () => {
  const { root, session } = makeRepo();
  const names = ['with space.txt', 'שלום עולם.txt', '-dash.txt', 'glob[1]{a,b}.txt', 'sub/dir/file.txt', 'left alone.txt'];
  names.forEach(name => write(root, name));
  const result = await commitChanges(session, { message: 'Add files\n\nBody line', paths: names.slice(0, 5) });
  assert.match(result.hash, /^[0-9a-f]{4,}$/);
  assert.strictEqual(sh(root, 'show', '-s', '--format=%B', 'HEAD'), 'Add files\n\nBody line');
  assert.deepStrictEqual(sh(root, '-c', 'core.quotepath=false', 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(), names.slice(0, 5).map(name => name).sort());
  assert.match(sh(root, 'status', '--porcelain'), /\?\? "?left alone\.txt/);
});

test('deleted and renamed files, staged and not', async () => {
  const { root, session } = makeRepo();
  write(root, 'del.txt', 'd\n'); write(root, 'mv.txt', 'move me\nline\nline\n'); write(root, 'mv2.txt', 'move me too\nline\nline\n');
  sh(root, 'add', '.'); sh(root, 'commit', '-q', '-m', 'more');
  fs.unlinkSync(path.join(root, 'del.txt'));
  sh(root, 'mv', 'mv.txt', 'renamed.txt'); // staged rename
  fs.renameSync(path.join(root, 'mv2.txt'), path.join(root, 'renamed2.txt')); // unstaged: a delete and a new file
  const status = await commitStatus({ cwd: root });
  assert.deepStrictEqual(status.files.map(file => file.path).sort(), ['del.txt', 'mv2.txt', 'renamed.txt', 'renamed2.txt']);
  // The staged rename was not ticked: refused, and nothing was staged by the refusal.
  await rejects(commitChanges(session, { message: 'x', paths: ['del.txt', 'mv2.txt', 'renamed2.txt'] }), 409, /stage/);
  assert.strictEqual(sh(root, 'diff', '--cached', '--name-only'), 'renamed.txt'); // only what was staged before
  await commitChanges(session, { message: 'all', paths: status.files.map(file => file.path) });
  assert.strictEqual(sh(root, 'status', '--porcelain'), '');
  assert.match(sh(root, 'show', '--name-status', '--format=', '-M', 'HEAD'), /D\s+del\.txt/);
});

test('refuses paths that are not in the status list, an empty message and an over-long one', async () => {
  const { root, session } = makeRepo();
  write(root, 'a.txt');
  for (const bad of ['../outside.txt', path.join(root, 'a.txt'), ':(glob)*.txt', '*', 'base.txt', '']) {
    await rejects(commitChanges(session, { message: 'm', paths: [bad] }), 400, /ברשימת השינויים/);
  }
  await rejects(commitChanges(session, { message: '   \n', paths: ['a.txt'] }), 400, /ריקה/);
  await rejects(commitChanges(session, { message: 'x'.repeat(10001), paths: ['a.txt'] }), 400, /ארוכה/);
  await rejects(commitChanges(session, { message: 'm', paths: [] }), 400);
  await rejects(commitChanges(session, { message: 'm', paths: 'a.txt' }), 400);
  assert.strictEqual(sh(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('a message that looks like an option or shell syntax is only a message', async () => {
  const { root, session } = makeRepo();
  write(root, 'a.txt');
  await commitChanges(session, { message: '--amend $(echo hi) "quoted" `x`', paths: ['a.txt'] });
  assert.strictEqual(sh(root, 'log', '-1', '--format=%s'), '--amend $(echo hi) "quoted" `x`');
  assert.strictEqual(sh(root, 'rev-list', '--count', 'HEAD'), '2');
});

test('a failing pre-commit hook returns its text and leaves the files staged', async () => {
  const { root, session } = makeRepo();
  fs.writeFileSync(path.join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "lint failed: no tabs" >&2\nexit 1\n', { mode: 0o755 });
  write(root, 'a.txt');
  await rejects(commitChanges(session, { message: 'm', paths: ['a.txt'] }), 409, /lint failed: no tabs[\s\S]*stage/);
  assert.strictEqual(sh(root, 'rev-list', '--count', 'HEAD'), '1');
  assert.strictEqual(sh(root, 'diff', '--cached', '--name-only'), 'a.txt');
});

test('missing identity: git\'s own error comes back', async () => {
  const { root, session } = makeRepo();
  const empty = path.join(scratch, 'empty.gitconfig');
  fs.writeFileSync(empty, '');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1' });
  sh(root, 'config', 'user.useConfigOnly', 'true');
  write(root, 'a.txt');
  const saved = {};
  for (const key of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) { saved[key] = process.env[key]; delete process.env[key]; }
  sh(root, 'config', 'user.name', 'only-name'); // an email is still missing
  try {
    await rejects(commitChanges(session, { message: 'm', paths: ['a.txt'] }), 409, /ה-commit נכשל[\s\S]*(email|identity)/i);
  } finally { Object.assign(process.env, saved); delete process.env.GIT_CONFIG_GLOBAL; delete process.env.GIT_CONFIG_NOSYSTEM; }
});

test('merge in progress and detached HEAD', async () => {
  const { root, session } = makeRepo();
  sh(root, 'checkout', '-q', '-b', 'topic'); write(root, 'base.txt', 'topic\n'); sh(root, 'commit', '-qam', 'topic');
  sh(root, 'checkout', '-q', 'main'); write(root, 'base.txt', 'main\n'); sh(root, 'commit', '-qam', 'main');
  assert.throws(() => sh(root, 'merge', 'topic'));
  const status = await commitStatus({ cwd: root });
  assert.strictEqual(status.inProgress, 'merge');
  await rejects(commitChanges(session, { message: 'm', paths: ['base.txt'] }), 409, /merge/);
  await rejects(pushBranch(session), 409, /merge/);
  sh(root, 'merge', '--abort');
  sh(root, 'checkout', '-q', '--detach');
  write(root, 'd.txt');
  assert.strictEqual((await commitStatus({ cwd: root })).detached, true);
  assert.match((await commitStatus({ cwd: root })).pushReason, /מנותק/);
  await commitChanges(session, { message: 'on a detached head', paths: ['d.txt'] }); // allowed
  await rejects(pushBranch(session), 409, /מנותק/);
});

test('push: with upstream, set-upstream only when origin exists, never without a request', async () => {
  const noRemote = makeRepo();
  await rejects(pushBranch(noRemote.session, { setUpstream: true }), 409, /origin/);
  const { root, session } = makeRepo({ withOrigin: true });
  write(root, 'a.txt');
  const result = await commitChanges(session, { message: 'and push', paths: ['a.txt'], push: true });
  assert.strictEqual(result.pushed, true);
  assert.strictEqual(sh(root, 'rev-parse', 'HEAD'), sh(root, 'rev-parse', 'origin/main'));
  // a new branch with no upstream
  sh(root, 'checkout', '-q', '-b', 'feature');
  write(root, 'b.txt');
  const plain = await commitChanges(session, { message: 'feature', paths: ['b.txt'], push: true });
  assert.strictEqual(plain.pushed, false);
  assert.match(plain.pushError, /upstream/);
  const status = await commitStatus({ cwd: root });
  assert.strictEqual(status.canPushNewUpstream, true);
  const pushed = await pushBranch(session, { setUpstream: true });
  assert.strictEqual(pushed.setUpstream, true);
  assert.strictEqual(sh(root, 'rev-parse', '--abbrev-ref', '@{u}'), 'origin/feature');
});

test('push rejected as non-fast-forward: Hebrew advice, the commit stays, nothing forced', async () => {
  const { root, session } = makeRepo({ withOrigin: true });
  const other = path.join(scratch, `other${counter}`);
  sh(scratch, 'clone', '-q', '-b', 'main', sh(root, 'remote', 'get-url', 'origin'), other);
  write(other, 'theirs.txt'); sh(other, 'add', '.'); sh(other, 'commit', '-q', '-m', 'theirs'); sh(other, 'push', '-q');
  write(root, 'mine.txt');
  const result = await commitChanges(session, { message: 'mine', paths: ['mine.txt'], push: true });
  assert.strictEqual(result.pushed, false);
  assert.match(result.pushError, /נדחתה[\s\S]*pull/);
  assert.strictEqual(sh(root, 'log', '-1', '--format=%s'), 'mine');
  await rejects(pushBranch(session), 409, /נדחתה/);
});

test('one commit or push at a time per repository', async () => {
  let release;
  const first = withRepoLock('/some/repo', () => new Promise(resolve => { release = resolve; }));
  await rejects(withRepoLock('/some/repo', async () => 1), 409, /עדיין רצה/);
  await withRepoLock('/other/repo', async () => 1);
  release();
  await first;
  await withRepoLock('/some/repo', async () => 1);
});
