/**
 * Which file a preview request reaches: inside ONE of the session's folders (0 = its folder, 1.. = its extra folders), by
 * real path through files/safe-path.js, a regular file of an allowed static type, and none of the files the GUI never
 * shows here (.git, .claude, Claude's settings, the GUI's own code, data and config).
 */
const fs = require('fs');
const path = require('path');
const { httpError } = require('../http-utils');
const { realOrNull, isInside, resolveInside, writeRefusal, viewOnlyReason } = require('../files/safe-path');
const { PREVIEW_TYPES } = require('./preview-headers');

const GUI_ROOT = path.resolve(__dirname, '..', '..');
const MAX_PREVIEW_BYTES = 50 * 1024 * 1024;
const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

/** Why this real path is never served by the preview route, or null. */
function previewRefusal(real, root) {
  const segments = path.relative(root, real).split(path.sep).map(name => (CASE_INSENSITIVE ? name.toLowerCase() : name));
  if (segments.includes('.claude')) return 'קבצי .claude לא מוצגים בתצוגה המקדימה';
  const gui = realOrNull(GUI_ROOT);
  if (gui && isInside(real, gui)) return 'קבצי הממשק עצמו לא מוצגים בתצוגה המקדימה';
  return writeRefusal(real) || viewOnlyReason(real);
}

/** Decodes the URL path after the root index into a relative path; refuses absolute forms and NUL. */
function relativeOf(encoded) {
  let decoded;
  try { decoded = encoded.split('/').map(decodeURIComponent).join('/'); } catch { throw httpError(400, 'נתיב לא תקין'); }
  if (!decoded || decoded.includes('\0') || /^([a-z]:|[\\/])/i.test(decoded)) throw httpError(400, 'נתיב לא תקין');
  return decoded;
}

/**
 * @param {object} session from the store, never from the request @param {number} rootIndex
 * @param {string} encodedPath the URL path below the root index (percent-encoded)
 * @returns {{real:string, size:number, contentType:string}}
 */
function resolvePreviewFile(session, rootIndex, encodedPath) {
  const folders = [session.cwd, ...(session.addDirs || [])];
  const root = Number.isInteger(rootIndex) && rootIndex >= 0 && rootIndex < folders.length ? realOrNull(folders[rootIndex]) : null;
  if (!root) throw httpError(404, 'התיקייה לא נמצאה');
  const real = resolveInside([root], root, relativeOf(encodedPath)); // traversal, symlinks, 8.3 names, ":" streams
  const contentType = PREVIEW_TYPES[path.extname(real).toLowerCase()];
  if (!contentType) throw httpError(415, 'סוג קובץ שלא מוצג בתצוגה המקדימה');
  const reason = previewRefusal(real, root);
  if (reason) throw httpError(403, reason);
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw httpError(404, 'לא קובץ');
  if (stat.size > MAX_PREVIEW_BYTES) throw httpError(413, 'הקובץ גדול מדי לתצוגה מקדימה');
  return { real, size: stat.size, contentType };
}

module.exports = { resolvePreviewFile, previewRefusal };
