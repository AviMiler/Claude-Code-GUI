const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-folder-test-')));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
const { resolveTerminalFolder } = require('../lib/terminal/terminal-folder');

const project = path.join(scratch, 'project');
const outside = path.join(scratch, 'project-evil');
fs.mkdirSync(path.join(project, 'sub', 'deep'), { recursive: true });
fs.mkdirSync(outside);
fs.writeFileSync(path.join(project, 'sub', 'file.txt'), 'x');
const session = { id: 's', cwd: project, addDirs: [] };
const same = (a, b) => assert.equal(a.toLowerCase(), b.toLowerCase());

test('a folder inside the session resolves, absolute or relative', () => {
  same(resolveTerminalFolder(session, path.join(project, 'sub')), path.join(project, 'sub'));
  same(resolveTerminalFolder(session, 'sub/deep'), path.join(project, 'sub', 'deep'));
});

test('a file resolves to its folder', () => {
  same(resolveTerminalFolder(session, path.join(project, 'sub', 'file.txt')), path.join(project, 'sub'));
});

test('outside, traversal, sibling prefix, missing and odd input are refused', () => {
  assert.throws(() => resolveTerminalFolder(session, outside), { status: 403 });
  assert.throws(() => resolveTerminalFolder(session, '..'), { status: 403 });
  assert.throws(() => resolveTerminalFolder(session, 'sub/../../project-evil'), { status: 403 });
  assert.throws(() => resolveTerminalFolder(session, 'nope'), { status: 404 });
  assert.throws(() => resolveTerminalFolder(session, ''), { status: 400 });
  assert.throws(() => resolveTerminalFolder(session, 42), { status: 400 });
  assert.throws(() => resolveTerminalFolder(session, 'a\0b'), { status: 400 });
});

test('an extra folder of the session counts, a missing session folder does not', () => {
  same(resolveTerminalFolder({ ...session, addDirs: [outside] }, outside), outside);
  assert.throws(() => resolveTerminalFolder({ id: 's', cwd: path.join(scratch, 'gone') }, '.'), { status: 409 });
});
