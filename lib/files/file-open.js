/** A file for the editor: its text, how it is written (line endings, BOM), a hash to notice a change on disk, and whether it can be saved. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { httpError } = require('../http-utils');
const { rootsOf, resolveInside, isInside, realOrNull, writeRefusal } = require('./safe-path');
const { decode } = require('./text-format');

const MAX_EDIT_BYTES = 1024 * 1024;

const hashOf = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

/** The file's real path and its raw bytes (a folder, or a file over the editor's limit, is refused). */
function readRaw(session, requested) {
  const real = resolveInside(rootsOf(session), session.cwd, requested);
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw httpError(400, 'זו תיקייה, לא קובץ');
  if (stat.size > MAX_EDIT_BYTES) throw httpError(413, 'הקובץ גדול מדי לעריכה (מעל 1MB). אפשר לצפות בו בצופה.');
  return { real, stat, buffer: fs.readFileSync(real) };
}

/**
 * @param {object} session from the store, never from the request @param {string} requested absolute or relative to the session folder
 * @returns {{path:string, rel:string|null, content:string, eol:string, bom:boolean, hash:string, size:number, mtimeMs:number,
 *   writable:boolean, readOnlyReason:string|null}} rel: relative to the session folder, null for a file in an extra folder
 */
function openFile(session, requested) {
  const { real, stat, buffer } = readRaw(session, requested);
  const format = decode(buffer);
  const cwd = realOrNull(session.cwd);
  const readOnlyReason = format.readOnlyReason || writeRefusal(real) || (session.archived ? 'הסשן בארכיון' : null);
  return {
    path: real, rel: cwd && isInside(real, cwd) ? path.relative(cwd, real).split(path.sep).join('/') : null,
    content: format.content, eol: format.eol, bom: format.bom, hash: hashOf(buffer), size: stat.size, mtimeMs: stat.mtimeMs,
    writable: !readOnlyReason, readOnlyReason,
  };
}

module.exports = { openFile, readRaw, hashOf, MAX_EDIT_BYTES };
