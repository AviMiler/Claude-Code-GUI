/** Draws one file of the Changes pane (unified or side by side): numbered, syntax-coloured diff lines, a "+" to comment on a line, its comments and the open comment box. */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { anchorOf, commentRows } from './diff-comment-ui.js';
import { highlightHunk, setCode } from './diff-highlight.js';
import { splitRows, splitColumns, guardColumns } from './diff-split.js';

const STATUS_LABELS = { added: 'חדש', deleted: 'נמחק', renamed: 'שם חדש', modified: 'שונה' };

/**
 * Comments that have no line on screen (the line changed since, or the file left the diff): kept, listed, deletable.
 * @param {object[]} comments @param {string} title @param {(id:number)=>void} onRemove
 * @returns {HTMLElement|null}
 */
export function renderUnplacedComments(comments, title, onRemove) {
  if (!comments.length) return null;
  return h('div', { class: 'diff-outdated' }, h('b', null, title), comments.map(comment => h('div', { dir: 'auto' },
    h('span', null, `${comment.path}:${comment.line}${comment.side === 'old' ? ' (נמחקה)' : ''} – ${comment.text}`),
    h('button', { type: 'button', class: 'icon-button', title: 'מחיקה', onClick: () => onRemove(comment.id) }, icon('x')))));
}

function fileHead(file, commentCount, collapsed, onToggle, fullPath) {
  return h('button', { type: 'button', class: 'diff-file-head', 'aria-expanded': String(!collapsed), dataset: { filePath: fullPath },
    title: file.oldPath ? `${file.oldPath} → ${file.path}` : file.path, onClick: onToggle },
  icon('chevron-down', collapsed ? 'collapsed' : ''), h('span', { class: `diff-status ${file.status}` }, STATUS_LABELS[file.status]),
  h('span', { class: 'diff-path', dir: 'ltr' }, file.path),
  h('span', { class: 'diff-counts', dir: 'ltr' }, h('span', { class: 'added' }, `+${file.added}`), h('span', { class: 'removed' }, `−${file.removed}`)),
  commentCount ? h('span', { class: 'badge info' }, `${commentCount} הערות`) : null);
}

/** The file's table; the split one has fixed columns and a selection guard. */
function diffTable(split, rows) {
  if (!split) return h('table', { class: 'diff-table' }, h('tbody', null, rows));
  const table = h('table', { class: 'diff-table diff-split' }, splitColumns(), h('tbody', null, rows));
  guardColumns(table);
  return table;
}

/**
 * @param {import('./diff-parse.js').DiffFile} file
 * @param {{comments:object[], box:{anchor:object, draft:string, focus:boolean}|null, collapsed:boolean, onToggle:()=>void,
 *   onComment:(anchor:object)=>void, onInput:(text:string)=>void, onAdd:(comment:object)=>void, onCancel:()=>void,
 *   onRemove:(id:number)=>void, hunkAction?:(hunk:object, index:number)=>HTMLElement|null,
 *   fileAction?:(file:object, head:HTMLElement)=>HTMLElement|null, split?:boolean}} options split: side-by-side layout; comments: this file's comments; box: the open
 *   comment box, if on this file; hunkAction: a control for a hunk's header row (the revert button); fileAction: a control
 *   beside the file's header (the discard button)
 * @returns {HTMLElement}
 */
export function renderDiffFile(file, { comments, box, collapsed, fullPath, onToggle, onComment, onInput, onAdd, onCancel, onRemove, hunkAction, fileAction, split = false }) {
  const toggle = fileHead(file, comments.length, collapsed, onToggle, fullPath);
  const action = fileAction?.(file, toggle);
  const head = action ? h('div', { class: 'diff-file-bar' }, toggle, action) : toggle; // a button cannot hold another button
  if (collapsed) return h('section', { class: 'diff-file' }, head);
  const placed = new Set();
  const env = { comments, box, placed, colspan: split ? 4 : 3, onRemove, onInput, onAdd, onCancel };
  const rows = [];
  file.hunks.forEach((hunk, index) => {
    rows.push(h('tr', { class: 'diff-hunk' }, h('td', { colspan: env.colspan, dir: 'ltr' }, h('div', { class: 'diff-hunk-line' }, h('span', null, hunk.header), hunkAction?.(hunk, index)))));
    const html = highlightHunk(hunk, file.path); // only expanded files get here: colours are drawn lazily
    if (split) { rows.push(...splitRows(file, hunk, html, env, onComment)); return; }
    hunk.lines.forEach((line, at) => {
      const anchor = anchorOf(file, line);
      const code = h('td', { class: 'code', dir: 'ltr' }, h('span', { class: 'sign' }, line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '));
      setCode(code, line.text, html[at]);
      rows.push(h('tr', { class: `diff-row ${line.type}` },
        h('td', { class: 'no' }, line.oldLine ?? ''),
        h('td', { class: 'no' }, line.newLine ?? '',
          h('button', { type: 'button', class: 'diff-add-comment', title: 'הערה על השורה', onClick: () => onComment(anchor) }, icon('plus'))),
        code), ...commentRows([anchor], env));
    });
  });
  const status = file.binary ? 'קובץ בינארי.' : !file.hunks.length ? 'אין שינויי תוכן (הרשאות, שם, או קובץ ריק).' : null;
  return h('section', { class: 'diff-file' }, head,
    renderUnplacedComments(comments.filter(comment => !placed.has(comment.id)), 'הערות על שורות שהשתנו מאז:', onRemove),
    status ? h('p', { class: 'detail-muted' }, status) : null,
    file.hunks.length ? diffTable(split, rows) : null);
}
