/**
 * Backups of user-facing files the GUI replaces (settings, hooks, memory, project files). They live in the GUI's data
 * directory, never beside the target (a `.bak` in a project gets committed by mistake): `<data>/backups/<hash of the
 * absolute path>/<timestamp>-<basename>`, the newest KEEP per file. The folder is owner-only (it may hold secrets from
 * settings files) and is not under `public/`, so no route serves it.
 */
const realFs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.CLAUDE_GUI_DATA || path.join(__dirname, '..', 'data');
const KEEP = 10;

/** A stable id for a file: the hash of its absolute path (case-folded on Windows, where paths are case-insensitive). */
function pathHash(file) {
  const absolute = path.resolve(file);
  return crypto.createHash('sha256').update(process.platform === 'win32' ? absolute.toLowerCase() : absolute).digest('hex').slice(0, 16);
}

const stamp = time => new Date(time).toISOString().replace(/[-:.]/g, '');

/**
 * Copies the current `file` into the backup folder and deletes the oldest copies beyond `keep`. A missing file has nothing to keep.
 * @param {string} file @param {{fs?:object, dataDir?:string, now?:()=>number, keep?:number}} [options]
 * @returns {string|null} the backup's path, or null when `file` does not exist
 */
function backupFile(file, { fs = realFs, dataDir = DATA_DIR, now = Date.now, keep = KEEP } = {}) {
  const folder = path.join(dataDir, 'backups', pathHash(file));
  try { fs.accessSync(file); } catch { return null; }
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const time = now();
  let target = path.join(folder, `${stamp(time)}-${path.basename(file)}`);
  for (let n = 1; ; n++) { // two saves in the same millisecond must not overwrite each other
    try { fs.copyFileSync(file, target, realFs.constants.COPYFILE_EXCL); break; } catch (error) {
      if (error.code !== 'EEXIST' || n > 99) throw error;
      target = path.join(folder, `${stamp(time)}-${String(n).padStart(2, '0')}-${path.basename(file)}`);
    }
  }
  const names = fs.readdirSync(folder).sort(); // the timestamp prefix sorts oldest first
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    try { fs.unlinkSync(path.join(folder, name)); } catch { /* an old backup that cannot go is harmless */ }
  }
  return target;
}

module.exports = { backupFile, pathHash, DATA_DIR, KEEP };
