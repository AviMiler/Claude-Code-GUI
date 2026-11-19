/**
 * Where a text selection may be quoted into the chat, and what it quotes: the transcript (main and split pane), the Files
 * pane's editor (a text area), the read-only file viewer and a diff of the Changes pane. Everything else (the composer,
 * inputs, other dialogs, menus) is no source. Viewer and diff lines are read from the rows, never from the selection's
 * text, which holds the line numbers and the +/− signs.
 */
import { joinRows, lineRange } from './quote-format.js';

/** @typedef {{text:string, path?:string|null, from?:number|null, to?:number|null, note?:string, rect:DOMRect, host:HTMLElement}} QuoteSource
 *  rect: where the button goes; host: where it is appended (a modal dialog, or the body) */

const EDITOR = 'textarea.file-editor';
const intNumber = cell => { const value = Number.parseInt(cell?.textContent ?? '', 10); return Number.isInteger(value) ? value : null; };

/** The Files editor's selection (selectionStart/End), with the pointer as the button's place when it is inside the box. */
function editorSource(textarea, pointer) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  if (start === end || !value.slice(start, end).trim()) return null;
  const box = textarea.getBoundingClientRect();
  const inside = pointer && pointer.x >= box.left && pointer.x <= box.right && pointer.y >= box.top && pointer.y <= box.bottom;
  const rect = inside ? new DOMRect(pointer.x, pointer.y, 0, 0) : new DOMRect(box.left, box.top + 4, box.width, 0);
  const path = textarea.closest('.file-editor-view')?.querySelector('.editor-name')?.title || null;
  // without the newline that ends the selection, like lineRange, so the text's lines and the range agree
  return { text: value.slice(start, end).replace(/\n$/, ''), path, ...lineRange(value, start, end), rect, host: document.body };
}

/** The characters of `row` inside the range ('' when the range only touches its edge). */
function clipped(range, row) {
  const part = document.createRange();
  part.selectNodeContents(row);
  if (row.contains(range.startContainer)) part.setStart(range.startContainer, range.startOffset);
  if (row.contains(range.endContainer)) part.setEnd(range.endContainer, range.endOffset);
  return part.toString();
}

/** Rows of `rows` the range covers; a row it only touches at the edge (a drag that ends at the next line's start) is left out. */
const touched = (range, rows) => [...rows].filter(row => range.intersectsNode(row) && clipped(range, row) !== '');

/** One row whose text cell holds the whole selection: the exact fragment; otherwise whole rows. */
function fragment(range, rows, cellSelector) {
  if (rows.length !== 1) return null;
  const cell = rows[0].querySelector(cellSelector);
  return cell && cell.contains(range.startContainer) && cell.contains(range.endContainer) ? range.toString() : null;
}

/** The file viewer: `.file-line` rows of a line number and a text. */
function viewerSource(range, lines) {
  const rows = touched(range, lines.querySelectorAll('.file-line'));
  if (!rows.length) return null;
  const whole = joinRows(rows.map(row => ({ line: intNumber(row.querySelector('.line-no')), text: row.querySelector('.line-text')?.textContent ?? '' })));
  const exact = fragment(range, rows, '.line-text');
  const dialog = lines.closest('dialog');
  return { ...whole, text: exact ?? whole.text, path: dialog?.querySelector('.file-path')?.title || null, host: dialog || document.body };
}

/**
 * A diff: the new version's lines (context and added); when only deleted lines are selected, the old version's, marked.
 * Mixed selections leave the deleted lines out, so the range is one version's.
 */
function diffSource(range, table) {
  const rows = touched(range, table.querySelectorAll('tr.diff-row'));
  if (!rows.length) return null;
  const deleted = row => row.classList.contains('del');
  const onlyDeleted = rows.every(deleted);
  const kept = onlyDeleted ? rows : rows.filter(row => !deleted(row));
  const lineOf = row => intNumber(row.querySelectorAll('td.no')[onlyDeleted ? 0 : 1]);
  const textOf = row => { const cell = row.querySelector('td.code'); const sign = cell?.querySelector('.sign')?.textContent ?? ''; return (cell?.textContent ?? '').slice(sign.length); };
  const whole = joinRows(kept.map(row => ({ line: lineOf(row), text: textOf(row) })));
  const exact = fragment(range, kept, 'td.code');
  const path = table.closest('.diff-file')?.querySelector('[data-file-path]')?.dataset.filePath || null;
  const sign = range.startContainer.parentElement?.closest('.sign') || range.startContainer.matches?.('td.code'); // only then does the fragment start with the +/− sign
  return { ...whole, text: (sign ? exact?.replace(/^[+−-]/, '') : exact) ?? whole.text, path, note: onlyDeleted ? '(שורות שנמחקו)' : '', host: document.body };
}

/** The first non-empty box of a range (its first line), or its bounding box. */
function rangeRect(range) {
  return [...range.getClientRects()].find(rect => rect.width || rect.height) || range.getBoundingClientRect();
}

/**
 * @param {{x:number, y:number}|null} pointer where the mouse was released last
 * @returns {QuoteSource|null} the selection on screen when it can be quoted
 */
export function readSelection(pointer) {
  const active = document.activeElement;
  if (active?.matches?.(EDITOR)) return editorSource(active, pointer);
  if (active?.matches?.('input, textarea') && active.selectionStart !== active.selectionEnd) return null; // text selected in the composer or another field
  const selection = getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) return null;
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer;
  const element = common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement;
  if (!element || element.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .popover, .diff-comment-row')) return null;
  const table = element.closest('.diff-table'); // a selection over two files has no one table: no source
  if (table) return withRect(diffSource(range, table), range);
  const lines = element.closest('.file-lines');
  if (lines) return withRect(viewerSource(range, lines), range);
  if (element.closest('dialog')) return null; // other modals: settings, confirmations
  if (element.closest('.thread-column.messages')) return { text: selection.toString(), rect: rangeRect(range), host: document.body };
  return null;
}

const withRect = (source, range) => (source && source.text.trim() ? { ...source, rect: rangeRect(range) } : null);
