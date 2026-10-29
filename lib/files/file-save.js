/** Saves an edited file in place. Only a file that exists; one that changed on disk since it was opened is not overwritten unasked. */
const fs = require('fs');
const { httpError } = require('../http-utils');
const { refuseWrite } = require('./safe-path');
const { encode, decode } = require('./text-format');
const { readRaw, hashOf, MAX_EDIT_BYTES } = require('./file-open');

/** Status of the answer when the file changed on disk after it was opened (the browser offers overwrite / reload). */
const CONFLICT_STATUS = 412;

/**
 * @param {object} session @param {{path:string, content:string, baseHash:string, eol:'lf'|'crlf', bom:boolean, overwrite?:boolean}} edit
 * @returns {{hash:string, size:number, mtimeMs:number}}
 */
function saveFile(session, { path: requested, content, baseHash, eol, bom, overwrite }) {
  if (typeof content !== 'string' || typeof baseHash !== 'string' || !['lf', 'crlf'].includes(eol)) throw httpError(400, 'בקשת שמירה לא תקינה');
  const data = encode(content, eol, Boolean(bom));
  if (data.length > MAX_EDIT_BYTES) throw httpError(413, 'הקובץ גדול מדי לשמירה (מעל 1MB)');
  const { real, buffer } = readRaw(session, requested); // re-read now: the check and the write happen with nothing in between
  refuseWrite(real);
  if (decode(buffer).readOnlyReason) throw httpError(409, 'הקובץ כבר אינו ניתן לעריכה כאן (סוף שורה מעורב)');
  if (overwrite !== true && hashOf(buffer) !== baseHash) throw httpError(CONFLICT_STATUS, 'הקובץ השתנה בדיסק מאז שנפתח');
  try { fs.writeFileSync(real, data); } catch (error) { throw httpError(403, `לא ניתן לכתוב לקובץ: ${error.message}`); }
  return { hash: hashOf(data), size: data.length, mtimeMs: fs.statSync(real).mtimeMs };
}

module.exports = { saveFile, CONFLICT_STATUS };
