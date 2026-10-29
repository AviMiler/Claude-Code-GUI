/**
 * Text files for the editor: UTF-8 only, with the line endings and the BOM remembered, so a save changes nothing but the
 * edit. The editor works on LF text; `encode` puts the file's own line endings back.
 */
const { httpError } = require('../http-utils');

const BINARY_SNIFF_BYTES = 8192;
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const strict = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * @param {Buffer} buffer
 * @returns {{content:string, eol:'lf'|'crlf', bom:boolean, readOnlyReason:string|null}} a file with mixed line endings
 *   comes back as it is and read-only (saving would rewrite every line)
 * @throws {Error} 415 for a binary file, UTF-16 or text that is not UTF-8
 */
function decode(buffer) {
  if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) throw httpError(415, 'קובץ בינארי – אין עריכת טקסט');
  const bom = buffer.subarray(0, 3).equals(UTF8_BOM);
  let text;
  try { text = strict.decode(bom ? buffer.subarray(3) : buffer); } catch { throw httpError(415, 'הקובץ אינו UTF-8, ולכן לא נערך כאן'); }
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  const cr = (text.match(/\r/g) || []).length - crlf;
  if (cr || (crlf && lf)) return { content: text, eol: crlf > lf ? 'crlf' : 'lf', bom, readOnlyReason: 'בקובץ סוגי סוף שורה מעורבים. עריכה כאן הייתה משנה את כל השורות.' };
  return { content: crlf ? text.replace(/\r\n/g, '\n') : text, eol: crlf ? 'crlf' : 'lf', bom, readOnlyReason: null };
}

/** @param {string} content LF text @param {'lf'|'crlf'} eol @param {boolean} bom @returns {Buffer} */
function encode(content, eol, bom) {
  const body = Buffer.from(eol === 'crlf' ? content.replace(/\n/g, '\r\n') : content, 'utf8');
  return bom ? Buffer.concat([UTF8_BOM, body]) : body;
}

module.exports = { decode, encode };
