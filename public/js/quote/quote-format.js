/**
 * Pure text of "הוספה לצ'אט": a selection becomes a Markdown quote, with a header line `path:from-to` when it comes from
 * a file (the Files viewer or editor) or a diff of the Changes pane. No DOM, so it is unit-tested in Node.
 */

/** The longest selection that is quoted; a longer one is refused with a toast. */
export const QUOTE_LIMIT = 20000;

/**
 * @param {{text:string, path?:string|null, from?:number|null, to?:number|null, note?:string}} source text: the selected text;
 *   path: the file's full path; from / to: its first and last line (1-based); note: added after the range (deleted lines)
 * @returns {string} the header line (when there is a path) and the text as `> ` lines; '' for an empty selection
 * @example formatQuote({ text: 'a\nb', path: 'src/x.js', from: 3, to: 4 }) // 'src/x.js:3-4\n> a\n> b'
 */
export function formatQuote({ text, path = null, from = null, to = null, note = '' }) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  let first = from;
  while (lines.length && !lines[0].trim()) { lines.shift(); if (Number.isInteger(first)) first++; } // blank lines around the selection carry nothing
  let last = Number.isInteger(to) ? to : first;
  while (lines.length && !lines.at(-1).trim()) { lines.pop(); if (Number.isInteger(last)) last--; }
  if (!lines.length) return '';
  const quoted = lines.map(line => (line ? `> ${line}` : '>'));
  return path ? [`${path}${rangeLabel(first, last)}${note ? ` ${note}` : ''}`, ...quoted].join('\n') : quoted.join('\n');
}

/** `:12`, `:12-18` or '' (no line numbers). */
function rangeLabel(from, to) {
  if (!Number.isInteger(from) || from < 1) return '';
  return Number.isInteger(to) && to > from ? `:${from}-${to}` : `:${from}`;
}

/**
 * The composer's new text (the templates' rule): an empty box gets the quote alone, a box with text gets it after a blank line.
 * @param {string} current what the box holds @param {string} quote @returns {string}
 */
export function appendQuote(current, quote) {
  const kept = String(current || '').replace(/\s+$/, '');
  return kept ? `${kept}\n\n${quote}` : quote;
}

/**
 * The lines (1-based) a text-area selection covers, counted from the text before it. A selection that ends right after
 * a newline does not cover the next line.
 * @param {string} value the whole text @param {number} start selectionStart @param {number} end selectionEnd
 * @returns {{from:number, to:number}}
 */
export function lineRange(value, start, end) {
  const text = String(value || '');
  const from = text.slice(0, start).split('\n').length;
  const selected = text.slice(start, end).replace(/\n$/, '');
  return { from, to: from + selected.split('\n').length - 1 };
}

/**
 * Text and line range of whole rows (the viewer's lines, a diff's rows).
 * @param {{line:number|null, text:string}[]} rows in order @returns {{text:string, from:number|null, to:number|null}}
 */
export function joinRows(rows) {
  const numbers = rows.map(row => row.line).filter(Number.isInteger);
  return { text: rows.map(row => row.text).join('\n'), from: numbers.length ? Math.min(...numbers) : null, to: numbers.length ? Math.max(...numbers) : null };
}
