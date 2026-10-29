/**
 * Read-only text of a file for the file viewer (a click on a path in a tool row). Only files inside the session's
 * folder, its extra folders and the uploads folder: the places Claude works in without asking.
 */
const fs = require('fs');
const path = require('path');
const service = require('./session-service');
const uploads = require('./uploads');
const { httpError } = require('./http-utils');
const { realOrNull, isInside } = require('./files/safe-path');

const MAX_BYTES = 2 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8192;

/**
 * @param {string} sessionId the folders come from the session on the server, never from the request
 * @param {string} requestedPath absolute, or relative to the session folder
 * @returns {{path:string, content:string, totalLines:number, truncated:boolean, size:number}}
 * @example viewFile(id, 'src/app.js') // { path: 'C:\\repo\\src\\app.js', content: '…', totalLines: 120, truncated: false, size: 3021 }
 */
function viewFile(sessionId, requestedPath) {
  const session = service.requireSession(sessionId);
  if (typeof requestedPath !== 'string' || !requestedPath.trim()) throw httpError(400, 'חסר נתיב קובץ');
  const roots = [session.cwd, ...(session.addDirs || []), uploads.uploadsDir()].map(realOrNull).filter(Boolean);
  // Symlinks and ".." are resolved first, and the file is read from the resolved path that was checked.
  const real = realOrNull(path.resolve(session.cwd, requestedPath.trim().replace(/^"(.*)"$/, '$1')));
  if (!real) throw httpError(404, `הקובץ לא נמצא: ${requestedPath}`);
  if (!roots.some(root => isInside(real, root))) throw httpError(403, 'הקובץ מחוץ לתיקיות של הסשן');
  const stat = fs.statSync(real);
  if (stat.isDirectory()) throw httpError(400, 'זו תיקייה, לא קובץ');
  const length = Math.min(stat.size, MAX_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(real, 'r');
  try { fs.readSync(fd, buffer, 0, length, 0); } finally { fs.closeSync(fd); }
  if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) throw httpError(415, 'קובץ בינארי – אין תצוגת טקסט');
  const content = buffer.toString('utf8');
  const totalLines = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
  return { path: real, content, totalLines, truncated: stat.size > MAX_BYTES, size: stat.size };
}

module.exports = { viewFile };
