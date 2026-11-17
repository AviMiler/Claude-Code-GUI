const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'own-files-test-'));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
const store = require('../lib/session-store');
const { openFile } = require('../lib/files/file-open');
const { saveFile } = require('../lib/files/file-save');
const { resolvePreviewFile } = require('../lib/preview/preview-file');
const { viewFile } = require('../lib/file-view');

const project = path.join(scratch, 'project');
fs.mkdirSync(path.join(process.env.CLAUDE_GUI_DATA, 'backups'), { recursive: true });
fs.mkdirSync(project, { recursive: true });
const secret = path.join(process.env.CLAUDE_GUI_DATA, 'backups', 'settings.html');
fs.writeFileSync(secret, '<p>secret</p>');
fs.writeFileSync(process.env.CLAUDE_GUI_CONFIG, '{}');
fs.writeFileSync(path.join(project, 'normal.html'), '<p>ok</p>');
fs.writeFileSync(path.join(project, 'other.html'), '<p>other</p>');
fs.linkSync(path.join(project, 'other.html'), path.join(project, 'twin.html')); // nlink 2, but not a GUI file
fs.linkSync(secret, path.join(project, 'link.html'));
fs.linkSync(process.env.CLAUDE_GUI_CONFIG, path.join(project, 'config-link.html'));
const session = store.create({ name: 'p', cwd: project, mode: 'default' });

test('a hard link to a file of the data folder is refused for open, save, view and preview', () => {
  for (const name of ['link.html', 'config-link.html']) {
    assert.throws(() => openFile(session, path.join(project, name)), { status: 403 }, name);
    assert.throws(() => viewFile(session.id, path.join(project, name)), { status: 403 }, name);
    assert.throws(() => resolvePreviewFile(session, 0, name), { status: 403 }, name);
    assert.throws(() => saveFile(session, { path: path.join(project, name), content: 'x', baseHash: 'x', eol: 'lf', overwrite: true }), { status: 403 }, name);
  }
  assert.equal(fs.readFileSync(secret, 'utf8'), '<p>secret</p>');
});

test('a normal file, and a hard link between project files, are still served', () => {
  assert.equal(openFile(session, path.join(project, 'normal.html')).content, '<p>ok</p>');
  assert.equal(openFile(session, path.join(project, 'twin.html')).content, '<p>other</p>');
  assert.equal(resolvePreviewFile(session, 0, 'twin.html').contentType, 'text/html; charset=utf-8');
  assert.equal(viewFile(session.id, path.join(project, 'normal.html')).content, '<p>ok</p>');
});
