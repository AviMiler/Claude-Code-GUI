/** Where a file request may reach: inside the session's folders, by real path (symlinks and ".." resolved first). */
const fs = require('fs');
const path = require('path');
const { httpError } = require('../http-utils');
const { DATA_DIR } = require('../session-store');
const { CONFIG_PATH } = require('../config');
const { isOwnFile } = require('./own-files');

const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

const realOrNull = target => { try { return fs.realpathSync.native(target); } catch { return null; } }; // native: expands 8.3 short names
const comparable = target => (CASE_INSENSITIVE ? target.toLowerCase() : target);

/** A ":" after the drive letter: an NTFS alternate data stream (file.json::$DATA) or another device path form. */
const hasStreamMark = target => target.replace(/^[a-z]:/i, '').includes(':');

/** True when both paths are the same file or folder (device + file id), whatever their names (short names, hard links). */
function sameFile(a, b) {
  try {
    const first = fs.statSync(a, { bigint: true });
    const second = fs.statSync(b, { bigint: true });
    return first.ino !== 0n && first.ino === second.ino && first.dev === second.dev;
  } catch { return false; }
}

/** True when `target` is `root` or below it (a path-separator boundary, so /proj never matches /proj-evil). */
function isInside(target, root) {
  const relative = path.relative(comparable(root), comparable(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** The folders a session works in: its own and its extra ones (real paths; a missing one is left out). */
const rootsOf = session => [session.cwd, ...(session.addDirs || [])].map(realOrNull).filter(Boolean);

/**
 * @param {string[]} roots real paths @param {string} base what a relative path is relative to
 * @param {string} requested absolute, or relative to `base` @returns {string} the real path, inside a root
 */
function resolveInside(roots, base, requested) {
  if (typeof requested !== 'string' || !requested.trim() || requested.includes('\0')) throw httpError(400, 'חסר נתיב קובץ');
  const wanted = requested.trim().replace(/^"(.*)"$/, '$1');
  if (hasStreamMark(wanted)) throw httpError(400, 'נתיב עם ":" לא נתמך (זרם נתונים חלופי)');
  const real = realOrNull(path.resolve(base, wanted));
  if (!real) throw httpError(404, `הקובץ לא נמצא: ${requested}`);
  if (!roots.some(root => isInside(real, root))) throw httpError(403, 'הקובץ מחוץ לתיקיות של הסשן');
  return real;
}

/** The path itself and every folder above it. */
function ancestors(target) {
  const list = [];
  for (let dir = target; ; dir = path.dirname(dir)) { list.push(dir); if (path.dirname(dir) === dir) return list; }
}

/**
 * Why the editor never writes this file, or null: anything under a .git folder (a hook there runs as code), and this
 * GUI's own data and settings (they hold the sessions and the model token).
 */
function writeRefusal(real) {
  if (hasStreamMark(real)) return 'נתיב עם ":" לא נערך כאן';
  if (ancestors(real).some(dir => comparable(path.basename(dir)) === '.git' || sameFile(dir, path.join(path.dirname(dir), '.git')))) return 'לא עורכים קבצים בתוך .git';
  const own = [realOrNull(DATA_DIR), realOrNull(CONFIG_PATH)].filter(Boolean);
  return own.some(target => isInside(real, target) || sameFile(real, target)) ? 'קבצי ההגדרות והנתונים של הממשק עצמו לא נערכים כאן' : readRefusal(real);
}

/** Why this file is never shown or served: a hard link (another path, same file) of a file in the GUI's data folder or its config. */
function readRefusal(real) {
  return isOwnFile(real) ? 'הקובץ הוא קישור קשיח לקבצי הנתונים או ההגדרות של הממשק עצמו' : null;
}

function refuseWrite(real) {
  const reason = writeRefusal(real);
  if (reason) throw httpError(403, reason);
}

/** Claude's own configuration files: shown, never edited here (Claude Desktop does the same); they change through the settings screens. */
function viewOnlyReason(real) {
  if (hasStreamMark(real)) return 'נתיב עם ":" לא נערך כאן';
  const folder = path.dirname(real);
  const inClaudeDir = path.basename(folder) === '.claude' || sameFile(folder, path.join(path.dirname(folder), '.claude'));
  const protectedFiles = [path.join(folder, '.mcp.json'), ...(inClaudeDir ? ['settings.json', 'settings.local.json'].map(name => path.join(folder, name)) : [])];
  // By name, and by identity so that a short name (SETTIN~1.JSO) or a hard link of the file is the same file
  const isConfig = protectedFiles.some(file => comparable(path.basename(file)) === comparable(path.basename(real)) || sameFile(file, real));
  return isConfig ? 'קובץ הגדרות של Claude. נערך דרך מסכי ההגדרות, לא כאן' : null;
}

function refuseViewOnly(real) {
  const reason = viewOnlyReason(real);
  if (reason) throw httpError(403, reason);
}

module.exports = { realOrNull, isInside, rootsOf, resolveInside, writeRefusal, readRefusal, refuseWrite, viewOnlyReason, refuseViewOnly };
