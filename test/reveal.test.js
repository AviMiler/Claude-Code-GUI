const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'reveal-test-'));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
const { revealInExplorer, openInEditor } = require('../lib/files/reveal');
const editors = require('../lib/files/editors');
const { openFile } = require('../lib/files/file-open');
const { saveFile } = require('../lib/files/file-save');
const { loadConfig } = require('../lib/config');

const project = path.join(scratch, 'פרויקט עם רווחים');
const outside = path.join(scratch, 'outside');
fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
fs.mkdirSync(outside);
fs.writeFileSync(path.join(project, 'קובץ ראשון.txt'), 'x');
fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
fs.writeFileSync(path.join(project, '.mcp.json'), '{}');
fs.writeFileSync(path.join(project, '.claude', 'settings.json'), '{}');
fs.writeFileSync(path.join(project, '.claude', 'settings.local.json'), '{}');
fs.writeFileSync(path.join(project, 'settings.json'), '{}');
const session = { id: 's1', cwd: project, addDirs: [] };

/** A spawn stand-in: records the call, answers "started" (or an error) on the next tick. */
function fakeSpawn(failWith) {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.unref = () => {};
    calls.push({ command, args, options });
    process.nextTick(() => (failWith ? child.emit('error', Object.assign(new Error('x'), { code: failWith })) : child.emit('spawn')));
    return child;
  };
  return { spawn, calls };
}
const windows = (...found) => ({ platform: 'win32', env: { PATH: 'C:\\bin;C:\\Windows\\System32' }, exists: file => found.includes(file) });

test('reveal resolves inside the session and refuses traversal, outside paths and missing files', async () => {
  const { spawn, calls } = fakeSpawn();
  await assert.rejects(revealInExplorer(session, { path: '..\\outside\\secret.txt' }, { spawn, platform: 'win32' }), { status: 403 });
  await assert.rejects(revealInExplorer(session, { path: path.join(outside, 'secret.txt') }, { spawn, platform: 'win32' }), { status: 403 });
  await assert.rejects(revealInExplorer(session, { path: 'missing.txt' }, { spawn, platform: 'win32' }), { status: 404 });
  await assert.rejects(revealInExplorer(session, { path: '' }, { spawn, platform: 'win32' }), { status: 400 });
  await assert.rejects(revealInExplorer(session, {}, { spawn, platform: 'win32' }), { status: 400 });
  assert.equal(calls.length, 0, 'nothing is started for a refused path');
});

test('reveal on Windows selects the real path (spaces and Hebrew stay one argument)', async () => {
  const { spawn, calls } = fakeSpawn();
  await revealInExplorer(session, { path: 'קובץ ראשון.txt' }, { spawn, platform: 'win32' });
  assert.equal(calls[0].command, 'explorer.exe');
  assert.deepEqual(calls[0].args, ['/select,', fs.realpathSync(path.join(project, 'קובץ ראשון.txt'))]);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.stdio, 'ignore');
});

test('reveal on other platforms; unsupported platform is 501', () => {
  const target = '/p/a b.txt';
  assert.deepEqual(editors.buildRevealLaunch({ target, isDir: false }, 'darwin').args, ['-R', target]);
  assert.deepEqual(editors.buildRevealLaunch({ target, isDir: false }, 'linux').args, [path.dirname(target)]);
  assert.throws(() => editors.buildRevealLaunch({ target, isDir: false }, 'freebsd'), { status: 501 });
});

test('the editor is an enum: unknown values become the default and the request cannot choose it', async () => {
  assert.equal(editors.normalizeEditor('cursor'), 'cursor');
  assert.equal(editors.normalizeEditor('calc.exe'), 'code');
  assert.equal(editors.normalizeEditor(undefined), 'code');
  const { spawn, calls } = fakeSpawn();
  const deps = { ...windows('C:\\bin\\code.exe'), spawn };
  await openInEditor(session, { path: 'קובץ ראשון.txt', editor: 'calc.exe' }, { editor: 'code' }, deps);
  assert.equal(calls[0].command, 'C:\\bin\\code.exe');
  assert.equal(loadConfig().editor, 'code');
});

test('config.editor is validated against the enum', () => {
  fs.writeFileSync(process.env.CLAUDE_GUI_CONFIG, JSON.stringify({ editor: 'zed' }));
  assert.equal(loadConfig().editor, 'zed');
  fs.writeFileSync(process.env.CLAUDE_GUI_CONFIG, JSON.stringify({ editor: 'rm -rf' }));
  const original = console.error; console.error = () => {};
  try { assert.equal(loadConfig().editor, 'code'); } finally { console.error = original; }
});

test('a .cmd shim goes through cmd.exe with quoted arguments; Hebrew and spaces survive', () => {
  const target = 'C:\\פרויקט עם רווחים\\קובץ ראשון.txt';
  const plan = editors.buildEditorLaunch({ editor: 'code', target, isDir: false }, windows('C:\\bin\\code.cmd'));
  assert.equal(plan.command, 'cmd.exe');
  assert.deepEqual(plan.args, ['/d', '/s', '/c', `""C:\\bin\\code.cmd" "${target}""`]);
  assert.equal(plan.options.windowsVerbatimArguments, true);
  assert.equal(plan.options.detached, true);
});

test('a path cmd.exe could interpret is refused for a .cmd shim', () => {
  for (const name of ['a&calc.txt', 'a%PATH%.txt', 'a"b.txt', 'a^b.txt', 'a|b.txt']) {
    assert.throws(() => editors.buildEditorLaunch({ editor: 'cursor', target: `C:\\p\\${name}`, isDir: false }, windows('C:\\bin\\cursor.cmd')), { status: 400 }, name);
  }
});

test('a .exe is started directly with the path as one argument', () => {
  const plan = editors.buildEditorLaunch({ editor: 'zed', target: 'C:\\a b\\ג.txt', isDir: false }, windows('C:\\bin\\zed.exe'));
  assert.deepEqual([plan.command, plan.args], ['C:\\bin\\zed.exe', ['C:\\a b\\ג.txt']]);
});

test('missing editor: Notepad fallback on Windows for a file, a clear Hebrew 404 otherwise', () => {
  const plan = editors.buildEditorLaunch({ editor: 'code', target: 'C:\\f.txt', isDir: false }, windows('C:\\Windows\\System32\\notepad.exe'));
  assert.equal(plan.editor, 'notepad');
  assert.throws(() => editors.buildEditorLaunch({ editor: 'code', target: 'C:\\f.txt', isDir: false }, windows()), error => error.status === 404 && /VS Code/.test(error.message));
  assert.throws(() => editors.buildEditorLaunch({ editor: 'code', target: '/f', isDir: false }, { platform: 'linux', env: { PATH: '/bin' }, exists: () => false }), { status: 404 });
  assert.throws(() => editors.buildEditorLaunch({ editor: 'notepad', target: 'C:\\d', isDir: true }, windows('C:\\Windows\\System32\\notepad.exe')), { status: 400 });
});

test('a spawn that reports ENOENT is a Hebrew 404', async () => {
  const { spawn } = fakeSpawn('ENOENT');
  await assert.rejects(revealInExplorer(session, { path: 'קובץ ראשון.txt' }, { spawn, platform: 'win32' }), { status: 404 });
});

test('Claude configuration files open view-only and the save route refuses them', () => {
  for (const rel of ['.mcp.json', '.claude/settings.json', '.claude/settings.local.json']) {
    const opened = openFile(session, rel);
    assert.equal(opened.writable, false, rel);
    assert.match(opened.readOnlyReason, /הגדרות של Claude/);
    const edit = { path: rel, content: '{"a":1}', baseHash: opened.hash, eol: 'lf', bom: false, overwrite: true };
    assert.throws(() => saveFile(session, edit), { status: 403 }, rel);
    assert.equal(fs.readFileSync(path.join(project, rel), 'utf8'), '{}');
  }
  assert.equal(openFile(session, 'settings.json').writable, true, 'only .claude/settings*.json');
});
