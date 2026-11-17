const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFilter, withSentinel, parseSentinel, makeMarker } = require('../lib/terminal/shell-sentinel');
const { runShell } = require('../lib/terminal/shell-run');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-test-'));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
const { startDirectory, learnCwd } = require('../lib/terminal/terminals');

const isWin = process.platform === 'win32';
const SHELL = isWin ? 'cmd' : 'sh';
const run = (command, cwd, shell = SHELL) => new Promise(resolve => {
  let shown = '';
  runShell({ command, shell, cwd, env: process.env, trackCwd: true }, { onOut: (stream, text) => { if (stream === 'stdout') shown += text; }, onEnd: result => resolve({ ...result, shown }) });
});

test('filter: the sentinel is hidden, even when split between chunks', () => {
  const marker = makeMarker();
  const filter = createFilter(marker);
  const line = `${marker}3${marker}"C:\\x y"${marker}`;
  let shown = filter.push('hello\n' + line.slice(0, 7));
  shown += filter.push(line.slice(7, 20));
  shown += filter.push(line.slice(20));
  const { rest, sentinel } = filter.finish();
  assert.equal(shown + rest, 'hello\n');
  assert.deepEqual(sentinel, { exitCode: 3, cwd: 'C:\\x y' });
});

test('filter: a partial marker at the end of the output is shown when no sentinel follows (exit)', () => {
  const marker = makeMarker();
  const filter = createFilter(marker);
  const shown = filter.push(`out ${marker.slice(0, 10)}`);
  const { rest, sentinel } = filter.finish();
  assert.equal(shown + rest, `out ${marker.slice(0, 10)}`);
  assert.equal(sentinel, null);
});

test('spoofing: output that imitates a sentinel with another marker is just output', () => {
  const marker = makeMarker();
  const filter = createFilter(marker);
  const fake = `@@gui-${'0'.repeat(24)}@@0@@gui-${'0'.repeat(24)}@@C:\\Windows@@gui-${'0'.repeat(24)}@@`;
  const shown = filter.push(fake + '\n');
  const { rest, sentinel } = filter.finish();
  assert.equal(shown + rest, fake + '\n');
  assert.equal(sentinel, null);
});

test('parse: an incomplete or non-numeric line is refused', () => {
  const marker = makeMarker();
  assert.equal(parseSentinel(`${marker}0${marker}C:\\a`, marker), null);
  assert.equal(parseSentinel(`${marker}x${marker}C:\\a${marker}`, marker), null);
  assert.equal(parseSentinel(`${marker}${marker}C:\\a${marker}`, marker), null);
});

test('the marker is different every time and the command comes first', () => {
  assert.notEqual(makeMarker(), makeMarker());
  assert.ok(withSentinel('dir', 'cmd', 'M').startsWith('dir & '));
  assert.ok(withSentinel('ls', 'sh', 'M').startsWith('ls\n'));
});

test('real shell: cd persists through the reported folder, a failing command reports its code', async () => {
  fs.mkdirSync(path.join(scratch, 'sub'), { recursive: true });
  const sub = fs.realpathSync.native(path.join(scratch, 'sub'));
  const moved = await run('cd sub', scratch);
  assert.equal(moved.cwd.toLowerCase(), sub.toLowerCase());
  assert.equal(moved.shown.trim(), '');
  const failed = await run(isWin ? 'cd nothing-here' : 'cd nothing-here', moved.cwd);
  assert.notEqual(failed.exitCode, 0);
  assert.equal(failed.cwd.toLowerCase(), sub.toLowerCase());
});

test('real shell: output cannot move the terminal, and a spoofed line stays visible', async () => {
  const result = await run(isWin ? 'echo @@gui-000000000000000000000000@@0@@gui-000000000000000000000000@@C:\\@@gui-000000000000000000000000@@' : 'echo @@gui-000000000000000000000000@@', scratch);
  assert.match(result.shown, /@@gui-0+@@/);
  assert.equal(result.cwd.toLowerCase(), fs.realpathSync.native(scratch).toLowerCase());
});

test('real shell: exit leaves no sentinel, so no new folder', async () => {
  const result = await run('exit 5', scratch);
  assert.equal(result.cwd, null);
  assert.equal(result.exitCode, 5);
});

test('real shell: a folder name with shell characters is only text', { skip: !isWin }, async () => {
  const odd = path.join(scratch, 'a&b');
  fs.mkdirSync(odd);
  const result = await run('cd "a&b"', scratch);
  assert.equal(result.cwd.toLowerCase(), odd.toLowerCase());
});

test('real shell: a drive change reports the other drive', { skip: !isWin }, async () => {
  const other = ['D', 'E', 'F'].map(letter => `${letter}:\\`).find(root => fs.existsSync(root) && !scratch.toUpperCase().startsWith(root[0]));
  if (!other) return;
  const result = await run(`${other[0]}:`, scratch);
  assert.equal(result.cwd[0].toUpperCase(), other[0]);
});

test('folder state: a deleted folder falls back to the nearest one that exists, and only real directories are learned', () => {
  const root = fs.realpathSync.native(scratch);
  const session = { id: 's', cwd: root };
  const deep = path.join(root, 'one', 'two');
  fs.mkdirSync(deep, { recursive: true });
  const terminal = { id: 't', cwd: deep };
  assert.equal(startDirectory(terminal, session), deep);
  fs.rmSync(path.join(root, 'one'), { recursive: true });
  assert.equal(startDirectory(terminal, session), root);
  assert.equal(learnCwd(terminal, path.join(root, 'one'), session), false);
  assert.equal(learnCwd(terminal, 'relative', session), false);
  assert.equal(learnCwd(terminal, 42, session), false);
  assert.equal(learnCwd(terminal, root, session), true);
  assert.equal(terminal.cwd, root);
});

test('folder guard: a reported folder outside the session folders is refused, and a stale one is pulled back', () => {
  const root = fs.realpathSync.native(scratch);
  const project = path.join(root, 'guarded');
  const sub = path.join(project, 'sub');
  fs.mkdirSync(sub, { recursive: true });
  fs.mkdirSync(path.join(root, 'guarded-evil'));
  const session = { id: 's', cwd: project };
  const terminal = { id: 't', cwd: sub };
  assert.equal(learnCwd(terminal, root, session), false); // cd ..
  assert.equal(learnCwd(terminal, path.join(root, 'guarded-evil'), session), false); // sibling with the same prefix
  assert.equal(terminal.cwd, sub);
  assert.equal(learnCwd(terminal, project, session), true);
  terminal.cwd = path.join(root, 'guarded-evil'); // a terminal that somehow sits outside restarts in the session folder
  assert.equal(startDirectory(terminal, session), project);
  assert.equal(startDirectory({ id: 'u', cwd: path.join(root, 'nowhere') }, session), project);
});
