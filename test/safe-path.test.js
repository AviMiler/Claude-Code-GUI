const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-path-test-'));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
const { openFile } = require('../lib/files/file-open');
const { saveFile } = require('../lib/files/file-save');
const { resolveInside } = require('../lib/files/safe-path');

const project = path.join(scratch, 'project');
fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
fs.mkdirSync(path.join(project, '.git', 'hooks'), { recursive: true });
fs.writeFileSync(path.join(project, '.mcp.json'), '{}');
fs.writeFileSync(path.join(project, '.claude', 'settings.json'), '{}');
fs.writeFileSync(path.join(project, '.claude', 'settings.local.json'), '{}');
fs.writeFileSync(path.join(project, '.git', 'hooks', 'pre-commit'), 'x');
fs.writeFileSync(path.join(project, 'plain.txt'), 'x');
const session = { id: 's1', cwd: project, addDirs: [] };
const attempt = (rel, opened) => ({ path: rel, content: '{"a":1}', baseHash: opened.hash, eol: 'lf', bom: false, overwrite: true });

/** The 8.3 short name of a file (Windows only), or null when the volume has none. */
function shortName(file) {
  if (process.platform !== 'win32') return null;
  try {
    const out = execSync(`cmd /d /c for %I in ("${file}") do @echo %~sI`, { encoding: 'utf8' }).trim();
    return /~\d/.test(path.basename(out)) ? out : null;
  } catch { return null; }
}

test('8.3 short names of protected files are still refused', { skip: process.platform !== 'win32' }, t => {
  const shorts = [path.join(project, '.claude', 'settings.json'), path.join(project, '.claude', 'settings.local.json'), path.join(project, '.mcp.json')].map(shortName).filter(Boolean);
  if (!shorts.length) return t.skip('8.3 names are disabled on this volume');
  for (const short of shorts) {
    const opened = openFile(session, short);
    assert.equal(opened.writable, false, short);
    assert.throws(() => saveFile(session, attempt(short, opened)), { status: 403 }, short);
  }
  assert.equal(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8'), '{}');
});

test('files in a .git folder are refused, also through a short name of the folder', { skip: process.platform !== 'win32' }, t => {
  const opened = openFile(session, '.git/hooks/pre-commit');
  assert.equal(opened.writable, false);
  const short = shortName(path.join(project, '.git'));
  if (!short) return t.skip('8.3 names are disabled on this volume');
  const through = path.join(short, 'hooks', 'pre-commit');
  assert.equal(openFile(session, through).writable, false);
  assert.throws(() => saveFile(session, attempt(through, opened)), { status: 403 });
});

test('a hard link of a protected file is refused by identity', t => {
  const link = path.join(project, 'innocent.txt');
  try { fs.linkSync(path.join(project, '.mcp.json'), link); } catch { return t.skip('hard links not available'); }
  try {
    const opened = openFile(session, 'innocent.txt');
    assert.equal(opened.writable, false);
    assert.throws(() => saveFile(session, attempt('innocent.txt', opened)), { status: 403 });
  } finally { fs.unlinkSync(link); }
});

test('a ":" in the path (NTFS alternate data stream) is refused', () => {
  for (const rel of ['.mcp.json::$DATA', '.mcp.json:stream', '.claude/settings.json::$DATA', 'plain.txt:x']) {
    assert.throws(() => openFile(session, rel), { status: 400 }, rel);
    assert.throws(() => saveFile(session, { path: rel, content: 'x', baseHash: 'x', eol: 'lf', overwrite: true }), { status: 400 }, rel);
  }
  assert.throws(() => resolveInside([project], project, 'a.txt:b'), { status: 400 });
  assert.equal(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8'), '{}');
});

test('an ordinary file stays writable', () => {
  assert.equal(openFile(session, 'plain.txt').writable, true);
});
