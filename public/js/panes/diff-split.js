/**
 * The Changes pane's side-by-side layout: the old version on the left, the new one on the right, code always left to
 * right. A hunk's runs of deleted and added lines are paired row by row; context lines sit on both sides.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { setCode } from './diff-highlight.js';
import { anchorOf, commentRows } from './diff-comment-ui.js';

/** The pane width (px) from which the side-by-side layout is offered. */
export const SPLIT_MIN_WIDTH = 700;

/**
 * Pairs a hunk's lines into rows of the old and the new side.
 * @param {import('./diff-parse.js').DiffLine[]} lines a hunk's lines
 * @returns {{old:number|null, new:number|null}[]} indexes into `lines`; a deleted run and the added run after it are
 *   paired top to bottom, the longer one leaves empty cells opposite; a context line is on both sides
 * @example pairLines([{type:'del'},{type:'add'},{type:'add'}]) // [{old:0,new:1},{old:null,new:2}]
 */
export function pairLines(lines) {
  const rows = [];
  let dels = [];
  let adds = [];
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push({ old: dels[i] ?? null, new: adds[i] ?? null });
    dels = [];
    adds = [];
  };
  lines.forEach((line, index) => {
    if (line.type === 'ctx') { flush(); rows.push({ old: index, new: index }); }
    else (line.type === 'del' ? dels : adds).push(index);
  });
  flush();
  return rows;
}

const SIGNS = { add: '+', del: '−', ctx: ' ' };

/** One side of a row: its line number (with the "+" for commenting) and its code, or two empty cells. */
function sideCells(side, line, html, number, anchor, onComment) {
  const type = line ? line.type : 'empty';
  const code = h('td', { class: `code ${side} ${type}`, dir: 'ltr' });
  if (line) { code.append(h('span', { class: 'sign' }, SIGNS[line.type])); setCode(code, line.text, html); }
  const no = h('td', { class: `no ${side} ${type}` }, number ?? '',
    anchor ? h('button', { type: 'button', class: 'diff-add-comment', title: 'הערה על השורה', onClick: () => onComment(anchor) }, icon('plus')) : null);
  return [no, code];
}

/**
 * @param {import('./diff-parse.js').DiffFile} file @param {import('./diff-parse.js').DiffHunk} hunk
 * @param {(string|null)[]} html highlighted HTML per hunk line (highlightHunk)
 * @param {object} env the comment env of commentRows (colspan 4) @param {(anchor:object)=>void} onComment
 * @returns {HTMLElement[]} the table rows of the hunk's lines (and their comments)
 */
export function splitRows(file, hunk, html, env, onComment) {
  const rows = [];
  for (const pair of pairLines(hunk.lines)) {
    const left = pair.old === null ? null : hunk.lines[pair.old];
    const right = pair.new === null ? null : hunk.lines[pair.new];
    const anchors = [left && left.type === 'del' ? anchorOf(file, left) : null, right ? anchorOf(file, right) : null];
    rows.push(h('tr', { class: 'diff-row diff-split-row' },
      ...sideCells('old', left, html[pair.old], left?.oldLine, anchors[0], onComment),
      ...sideCells('new', right, html[pair.new], right?.newLine, anchors[1], onComment)),
    ...commentRows(anchors.filter(Boolean), env));
  }
  return rows;
}

/** The split table's column widths: numbers narrow, the code cells share the rest. */
export const splitColumns = () => h('colgroup', null, h('col', { class: 'no' }), h('col'), h('col', { class: 'no' }), h('col'));

/** Starting a selection in one column makes the other one unselectable (CSS, by data-col), so a drag never mixes them. */
export function guardColumns(table) {
  table.addEventListener('mousedown', event => {
    const cell = event.target.closest?.('td.old, td.new');
    if (cell) table.dataset.col = cell.classList.contains('old') ? 'old' : 'new';
  });
}
