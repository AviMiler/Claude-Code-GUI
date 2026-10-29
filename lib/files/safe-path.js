/** Where a file request may reach: inside the session's folders, by real path (symlinks and ".." resolved first). */
const fs = require('fs');
const path = require('path');
const { httpError } = require('../http-utils');
const { DATA_DIR } = require('../session-store');
const { CONFIG_PATH } = require('../config');

const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

const realOrNull = target => { try { return fs.realpathSync(target); } catch { return null; } };
const comparable = target => (CASE_INSENSITIVE ? target.toLowerCase() : target);

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
  const real = realOrNull(path.resolve(base, requested.trim().replace(/^"(.*)"$/, '$1')));
  if (!real) throw httpError(404, `הקובץ לא נמצא: ${requested}`);
  if (!roots.some(root => isInside(real, root))) throw httpError(403, 'הקובץ מחוץ לתיקיות של הסשן');
  return real;
}

/**
 * Why the editor never writes this file, or null: anything under a .git folder (a hook there runs as code), and this
 * GUI's own data and settings (they hold the sessions and the model token).
 */
function writeRefusal(real) {
  if (real.split(/[\\/]/).some(part => comparable(part) === '.git')) return 'לא עורכים קבצים בתוך .git';
  const own = [realOrNull(DATA_DIR), realOrNull(CONFIG_PATH)].filter(Boolean);
  return own.some(target => isInside(real, target)) ? 'קבצי ההגדרות והנתונים של הממשק עצמו לא נערכים כאן' : null;
}

function refuseWrite(real) {
  const reason = writeRefusal(real);
  if (reason) throw httpError(403, reason);
}

module.exports = { realOrNull, isInside, rootsOf, resolveInside, writeRefusal, refuseWrite };
