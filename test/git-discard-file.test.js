// "ביטול השינויים בקובץ" of the Changes pane against scratch repositories.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-discard-'));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
Object.assign(process.env, { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' });
const { discardFile } = require('../lib/git/discard-file');
const { paneDiff } = require('../lib/git/discard-states');

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
let counter = 0;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, name, text = 'x\n') => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), text); };
const read = (root, name) => fs.readFileSync(path.join(root, name), 'utf8');
const exists = (root, name) => fs.existsSync(path.join(root, name));
const status = root => sh(root, 'status', '--porcelain', '--untracked-files=all');
const refused = (promise, code, pattern) => assert.rejects(promise, error => {
  assert.strictEqual(error.status, code, error.message);
  if (pattern) assert.match(error.message, pattern);
  return true;
});

/** A repository with base.txt and keep.txt committed, and the session shape the server stores. */
function makeRepo() {
  const root = path.join(scratch, `repo${++counter}`);
  fs.mkdirSync(root);
  sh(root, 'init', '-q', '-b', 'main');
  sh(root, 'config', 'core.autocrlf', 'false'); // the files come back byte for byte on a Windows machine too
  write(root, 'base.txt', 'base\n');
  write(root, 'keep.txt', 'keep\n');
  sh(root, 'add', '.');
  sh(root, 'commit', '-q', '-m', 'init');
  return { root, session: { id: `s${counter}`, cwd: root, archived: false } };
}

/** The request the pane sends for a path, from the same diff answer the pane gets. */
async function requestFor(session, relative) {
  const state = (await paneDiff({ cwd: session.cwd })).fileStates[relative];
  assert.ok(state, `no fileStates entry for ${relative}`);
  return { path: relative, status: state.status, diffHash: state.hash };
}
const discard = async (session, relative) => discardFile(session, await requestFor(session, relative));

test('modified, unstaged: back to HEAD, other files untouched', async () => {
  const { root, session } = makeRepo();
  write(root, 'base.txt', 'changed\n');
  write(root, 'keep.txt', 'keep changed\n');
  assert.strictEqual((await discard(session, 'base.txt')).kind, 'restore');
  assert.strictEqual(read(root, 'base.txt'), 'base\n');
  assert.strictEqual(status(root), 'M keep.txt');
});

test('modified, staged and unstaged: index and working tree back to HEAD', async () => {
  const { root, session } = makeRepo();
  write(root, 'base.txt', 'staged\n');
  sh(root, 'add', 'base.txt');
  write(root, 'base.txt', 'staged and more\n');
  assert.strictEqual((await requestFor(session, 'base.txt')).status, 'MM');
  await discard(session, 'base.txt');
  assert.strictEqual(read(root, 'base.txt'), 'base\n');
  assert.strictEqual(status(root), '');
});

test('deleted (unstaged and staged): the file comes back', async () => {
  const { root, session } = makeRepo();
  fs.unlinkSync(path.join(root, 'base.txt'));
  sh(root, 'rm', '-q', '--cached', 'keep.txt');
  fs.unlinkSync(path.join(root, 'keep.txt'));
  await discard(session, 'base.txt');
  await discard(session, 'keep.txt');
  assert.strictEqual(read(root, 'base.txt'), 'base\n');
  assert.strictEqual(read(root, 'keep.txt'), 'keep\n');
  assert.strictEqual(status(root), '');
});

test('staged new file (A and AM): unstaged and deleted', async () => {
  const { root, session } = makeRepo();
  write(root, 'new.txt', 'new\n');
  sh(root, 'add', 'new.txt');
  write(root, 'new.txt', 'new and more\n');
  const request = await requestFor(session, 'new.txt');
  assert.strictEqual(request.status, 'AM');
  assert.strictEqual((await discardFile(session, request)).kind, 'added');
  assert.strictEqual(exists(root, 'new.txt'), false);
  assert.strictEqual(status(root), '');
});

test('rename: the old name comes back from HEAD and the new one goes', async () => {
  const { root, session } = makeRepo();
  sh(root, 'mv', 'base.txt', 'moved.txt');
  assert.strictEqual((await discard(session, 'moved.txt')).kind, 'renamed');
  assert.strictEqual(read(root, 'base.txt'), 'base\n');
  assert.strictEqual(exists(root, 'moved.txt'), false);
  assert.strictEqual(status(root), '');
});

test('untracked file: deleted; a folder-level entry or another file is not touched', async () => {
  const { root, session } = makeRepo();
  write(root, 'dir/a.txt', 'a\n');
  write(root, 'dir/b.txt', 'b\n');
  assert.strictEqual((await discard(session, 'dir/a.txt')).kind, 'untracked');
  assert.strictEqual(exists(root, 'dir/a.txt'), false);
  assert.strictEqual(read(root, 'dir/b.txt'), 'b\n');
  await refused(discardFile(session, { path: 'dir/', status: '??', diffHash: 'x' }), 409);
  await refused(discardFile(session, { path: 'dir', status: '??', diffHash: 'x' }), 409);
  assert.strictEqual(read(root, 'dir/b.txt'), 'b\n');
});

test('stale: a changed diff or status since the pane drew it is 409 and nothing changes', async () => {
  const { root, session } = makeRepo();
  write(root, 'base.txt', 'first\n');
  const request = await requestFor(session, 'base.txt');
  write(root, 'base.txt', 'second\n');
  await refused(discardFile(session, request), 409, /השתנה מאז שהוצג/);
  await refused(discardFile(session, { ...(await requestFor(session, 'base.txt')), status: 'M ' }), 409, /השתנה מאז שהוצג/);
  assert.strictEqual(read(root, 'base.txt'), 'second\n');
});

test('a path that is not in the status, traversal and .git are refused', async () => {
  const { root, session } = makeRepo();
  write(root, 'base.txt', 'changed\n');
  const { status: code, diffHash } = await requestFor(session, 'base.txt');
  for (const bad of ['keep.txt', '../outside.txt', 'sub/../base.txt', '.git/config', path.join(root, 'base.txt')]) {
    await assert.rejects(discardFile(session, { path: bad, status: code, diffHash }), error => [400, 409].includes(error.status), bad);
  }
  await refused(discardFile(session, { path: 'base.txt', status: 5, diffHash }), 400);
  await refused(discardFile({ ...session, archived: true }, { path: 'base.txt', status: code, diffHash }), 409, /בארכיון/);
  assert.strictEqual(read(root, 'base.txt'), 'changed\n');
});

test('Claude settings files and a hard link to the GUI config are refused', async () => {
  const { root, session } = makeRepo();
  fs.writeFileSync(process.env.CLAUDE_GUI_CONFIG, '{}');
  write(root, '.mcp.json', '{}\n');
  write(root, '.claude/settings.json', '{}\n');
  fs.linkSync(process.env.CLAUDE_GUI_CONFIG, path.join(root, 'config-link.json'));
  for (const name of ['.mcp.json', '.claude/settings.json', 'config-link.json']) {
    await refused(discard(session, name), 403);
    assert.ok(exists(root, name), name);
  }
});

test('a file in conflict and a merge in progress are refused', async () => {
  const { root, session } = makeRepo();
  sh(root, 'checkout', '-q', '-b', 'other');
  write(root, 'base.txt', 'other\n');
  sh(root, 'commit', '-q', '-am', 'other');
  sh(root, 'checkout', '-q', 'main');
  write(root, 'base.txt', 'main\n');
  sh(root, 'commit', '-q', '-am', 'main');
  assert.throws(() => sh(root, 'merge', 'other'));
  write(root, 'keep.txt', 'changed\n');
  await refused(discardFile(session, { path: 'keep.txt', status: ' M', diffHash: 'x' }), 409, /merge/);
  await refused(discardFile(session, { path: 'base.txt', status: 'UU', diffHash: 'x' }), 409);
  assert.strictEqual(read(root, 'keep.txt'), 'changed\n');
});

test('a symlink is refused (skipped where links cannot be made)', async t => {
  const { root, session } = makeRepo();
  const link = path.join(root, 'link.txt');
  try { fs.symlinkSync('keep.txt', link, 'file'); } catch { return t.skip('no symlink permission'); }
  sh(root, 'config', 'core.symlinks', 'true');
  sh(root, 'add', 'link.txt');
  sh(root, 'commit', '-q', '-m', 'link');
  fs.unlinkSync(link);
  fs.symlinkSync('base.txt', link, 'file');
  await refused(discard(session, 'link.txt'), 409, /קישור/);
  assert.strictEqual(fs.readlinkSync(link), 'base.txt');
  return undefined;
});
