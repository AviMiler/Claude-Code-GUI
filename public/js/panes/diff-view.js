/** Draws one file of the Changes pane: numbered diff lines, a "+" to comment on a line, its comments and the open comment box. */
import { h } from '../dom.js';
import { icon } from '../icons.js';

const STATUS_LABELS = { added: 'חדש', deleted: 'נמחק', renamed: 'שם חדש', modified: 'שונה' };

/** Where a diff line can be commented: the new version's number, or the old one for a deleted line. */
const anchorOf = (file, line) => (line.type === 'del'
  ? { path: file.path, side: 'old', line: line.oldLine, quote: line.text }
  : { path: file.path, side: 'new', line: line.newLine, quote: line.text });

/** A comment stays on its line only while that line still reads the same; otherwise it is listed as changed since. */
const sameAnchor = (a, b) => Boolean(a && b) && a.path === b.path && a.side === b.side && a.line === b.line && a.quote === b.quote;

/**
 * @param {{anchor:object, draft:string, focus:boolean}} box draft: text typed so far (kept across redraws)
 * @param {{onInput:(text:string)=>void, onAdd:(comment:object)=>void, onCancel:()=>void}} handlers
 */
function commentBox(box, { onInput, onAdd, onCancel }) {
  const input = h('textarea', { rows: 2, dir: 'auto', 'aria-label': 'הערה על השורה',
    placeholder: 'הערה ל-Claude על השורה הזו… (Enter להוספה, Esc לביטול)' }, box.draft);
  const add = () => { if (input.value.trim()) onAdd({ ...box.anchor, text: input.value.trim() }); };
  input.addEventListener('input', () => onInput(input.value));
  input.addEventListener('keydown', event => {
    // Esc must not reach the page, where it would stop Claude's running turn.
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
    else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing) { event.preventDefault(); add(); }
  });
  if (box.focus) queueMicrotask(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
  return h('tr', { class: 'diff-comment-row' }, h('td', { colspan: 3 }, h('div', { class: 'diff-comment-box' }, input,
    h('div', { class: 'diff-comment-actions' },
      h('button', { type: 'button', class: 'btn ghost small', onClick: onCancel }, 'ביטול'),
      h('button', { type: 'button', class: 'btn primary small', onClick: add }, 'הוספת הערה')))));
}

function commentBubble(comment, onRemove) {
  return h('tr', { class: 'diff-comment-row' }, h('td', { colspan: 3 }, h('div', { class: 'diff-comment', dir: 'auto' },
    icon('message'), h('span', null, comment.text),
    h('button', { type: 'button', class: 'icon-button', title: 'מחיקת ההערה', onClick: () => onRemove(comment.id) }, icon('x')))));
}

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

/**
 * @param {import('./diff-parse.js').DiffFile} file
 * @param {{comments:object[], box:{anchor:object, draft:string, focus:boolean}|null, collapsed:boolean, onToggle:()=>void,
 *   onComment:(anchor:object)=>void, onInput:(text:string)=>void, onAdd:(comment:object)=>void, onCancel:()=>void,
 *   onRemove:(id:number)=>void}} options comments: this file's comments; box: the open comment box, if on this file
 * @returns {HTMLElement}
 */
export function renderDiffFile(file, { comments, box, collapsed, fullPath, onToggle, onComment, onInput, onAdd, onCancel, onRemove }) {
  const head = fileHead(file, comments.length, collapsed, onToggle, fullPath);
  if (collapsed) return h('section', { class: 'diff-file' }, head);
  const placed = new Set();
  const rows = [];
  for (const hunk of file.hunks) {
    rows.push(h('tr', { class: 'diff-hunk' }, h('td', { colspan: 3, dir: 'ltr' }, hunk.header)));
    for (const line of hunk.lines) {
      const anchor = anchorOf(file, line);
      rows.push(h('tr', { class: `diff-row ${line.type}` },
        h('td', { class: 'no' }, line.oldLine ?? ''),
        h('td', { class: 'no' }, line.newLine ?? '',
          h('button', { type: 'button', class: 'diff-add-comment', title: 'הערה על השורה', onClick: () => onComment(anchor) }, icon('plus'))),
        h('td', { class: 'code', dir: 'ltr' }, h('span', { class: 'sign' }, line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '), line.text)));
      for (const comment of comments.filter(item => sameAnchor(item, anchor))) {
        rows.push(commentBubble(comment, onRemove));
        placed.add(comment.id);
      }
      if (box && sameAnchor(box.anchor, anchor)) rows.push(commentBox(box, { onInput, onAdd, onCancel }));
    }
  }
  const status = file.binary ? 'קובץ בינארי.' : !file.hunks.length ? 'אין שינויי תוכן (הרשאות, שם, או קובץ ריק).' : null;
  return h('section', { class: 'diff-file' }, head,
    renderUnplacedComments(comments.filter(comment => !placed.has(comment.id)), 'הערות על שורות שהשתנו מאז:', onRemove),
    status ? h('p', { class: 'detail-muted' }, status) : null,
    file.hunks.length ? h('table', { class: 'diff-table' }, h('tbody', null, rows)) : null);
}
