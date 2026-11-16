const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFileSafe, readFileSafe } = require('../lib/safe-file');
const { backupFile, pathHash } = require('../lib/file-backup');

const scratch = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-safe-'));
  const dataDir = path.join(root, 'data');
  const project = path.join(root, 'proj');
  fs.mkdirSync(project);
  return { root, dataDir, project, file: path.join(project, 'settings.json') };
};
const backupFolder = (dataDir, file) => path.join(dataDir, 'backups', pathHash(file));
const backupsOf = (dataDir, file) => (fs.existsSync(backupFolder(dataDir, file)) ? fs.readdirSync(backupFolder(dataDir, file)).sort() : []);

test('the previous file is backed up in the data folder, never beside the target', () => {
  const { dataDir, project, file } = scratch();
  fs.writeFileSync(file, 'old');
  assert.equal(writeFileSafe(file, 'new', { dataDir }), 'rename');
  assert.equal(fs.readFileSync(file, 'utf8'), 'new');
  assert.deepEqual(fs.readdirSync(project), ['settings.json']); // no .bak, no .tmp
  const [name] = backupsOf(dataDir, file);
  assert.match(name, /^\d{8}T\d{9}Z-settings\.json$/);
  assert.equal(fs.readFileSync(path.join(backupFolder(dataDir, file), name), 'utf8'), 'old');
});

test('a new file has nothing to back up', () => {
  const { dataDir, file } = scratch();
  writeFileSafe(file, 'first', { dataDir });
  assert.deepEqual(backupsOf(dataDir, file), []);
});

test('only the newest 10 backups of a file are kept, even within one millisecond', () => {
  const { dataDir, file } = scratch();
  fs.writeFileSync(file, 'v0');
  for (let i = 1; i <= 15; i++) writeFileSafe(file, `v${i}`, { dataDir });
  const names = backupsOf(dataDir, file);
  assert.equal(names.length, 10);
  const texts = names.map(name => fs.readFileSync(path.join(backupFolder(dataDir, file), name), 'utf8')).sort();
  assert.deepEqual(texts, ['v10', 'v11', 'v12', 'v13', 'v14', 'v5', 'v6', 'v7', 'v8', 'v9']);
});

test('backups of different files do not mix', () => {
  const { dataDir, project, file } = scratch();
  const other = path.join(project, 'other.json');
  fs.writeFileSync(file, 'a'); fs.writeFileSync(other, 'b');
  writeFileSafe(file, 'a2', { dataDir }); writeFileSafe(other, 'b2', { dataDir });
  assert.notEqual(pathHash(file), pathHash(other));
  assert.equal(backupsOf(dataDir, file).length, 1);
  assert.equal(backupsOf(dataDir, other).length, 1);
});

test('the sibling .bak stays available for the session store (backup: sibling)', () => {
  const { dataDir, file } = scratch();
  fs.writeFileSync(file, '{"a":1}');
  writeFileSafe(file, 'not json', { backup: 'sibling', dataDir });
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), '{"a":1}');
  assert.deepEqual(backupsOf(dataDir, file), []);
  const result = readFileSafe(file, JSON.parse, { warn: () => {} });
  assert.equal(result.source, 'backup');
  assert.deepEqual(result.value, { a: 1 });
});

test('a failed write leaves the target untouched and no sibling .bak', () => {
  const { dataDir, project, file } = scratch();
  fs.writeFileSync(file, 'old');
  const failing = { ...fs, writeFileSync: (target, text) => { if (String(target).endsWith('.tmp')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return fs.writeFileSync(target, text); } };
  assert.throws(() => writeFileSafe(file, 'new', { fs: failing, dataDir }), /disk full/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'old');
  assert.ok(!fs.readdirSync(project).some(name => name.endsWith('.bak')));
});

test('a locked rename falls back to an in-place write; the backup exists and nothing is left beside the target', () => {
  const { dataDir, project, file } = scratch();
  fs.writeFileSync(file, 'old');
  const locked = { ...fs, renameSync: () => { throw Object.assign(new Error('locked'), { code: 'EPERM' }); } };
  assert.equal(writeFileSafe(file, 'new', { fs: locked, dataDir, sleep: () => {} }), 'in-place');
  assert.equal(fs.readFileSync(file, 'utf8'), 'new');
  assert.deepEqual(fs.readdirSync(project), ['settings.json']);
  assert.equal(backupsOf(dataDir, file).length, 1);
});

test('a backup that cannot be made does not stop the save', () => {
  const { root, file } = scratch();
  fs.writeFileSync(file, 'old');
  const blocker = path.join(root, 'blocker');
  fs.writeFileSync(blocker, 'x'); // a file where the data folder should be
  const quiet = console.error; console.error = () => {};
  try { writeFileSafe(file, 'new', { dataDir: path.join(blocker, 'data') }); } finally { console.error = quiet; }
  assert.equal(fs.readFileSync(file, 'utf8'), 'new');
});

test('backupFile returns null for a missing file', () => {
  const { dataDir, file } = scratch();
  assert.equal(backupFile(file, { dataDir }), null);
});
