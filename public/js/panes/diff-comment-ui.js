/** The line-comment pieces of the Changes pane's diff: the comment box, a saved comment and the rows that sit under a line. */
import { h } from '../dom.js';
import { icon } from '../icons.js';

/** Where a diff line can be commented: the new version's number, or the old one for a deleted line. */
export const anchorOf = (file, line) => (line.type === 'del'
  ? { path: file.path, side: 'old', line: line.oldLine, quote: line.text }
  : { path: file.path, side: 'new', line: line.newLine, quote: line.text });

/** A comment stays on its line only while that line still reads the same; otherwise it is listed as changed since. */
export const sameAnchor = (a, b) => Boolean(a && b) && a.path === b.path && a.side === b.side && a.line === b.line && a.quote === b.quote;

/**
 * @param {{anchor:object, draft:string, focus:boolean}} box draft: text typed so far (kept across redraws)
 * @param {{onInput:(text:string)=>void, onAdd:(comment:object)=>void, onCancel:()=>void}} handlers
 * @param {number} colspan the table's column count
 */
function commentBox(box, { onInput, onAdd, onCancel }, colspan) {
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
  return h('tr', { class: 'diff-comment-row' }, h('td', { colspan }, h('div', { class: 'diff-comment-box' }, input,
    h('div', { class: 'diff-comment-actions' },
      h('button', { type: 'button', class: 'btn ghost small', onClick: onCancel }, 'ביטול'),
      h('button', { type: 'button', class: 'btn primary small', onClick: add }, 'הוספת הערה')))));
}

function commentBubble(comment, onRemove, colspan) {
  return h('tr', { class: 'diff-comment-row' }, h('td', { colspan }, h('div', { class: 'diff-comment', dir: 'auto' },
    icon('message'), h('span', null, comment.text),
    h('button', { type: 'button', class: 'icon-button', title: 'מחיקת ההערה', onClick: () => onRemove(comment.id) }, icon('x')))));
}

/**
 * The comment rows under a table row: saved comments of its anchors and the open box when it is for one of them.
 * @param {object[]} anchors the row's commentable lines (one in the unified layout, up to two in the split one)
 * @param {{comments:object[], box:object|null, placed:Set<number>, colspan:number, onRemove:Function, onInput:Function,
 *   onAdd:Function, onCancel:Function}} env placed collects the ids of the comments that found their line
 * @returns {HTMLElement[]}
 */
export function commentRows(anchors, env) {
  const rows = [];
  for (const anchor of anchors) {
    for (const comment of env.comments.filter(item => sameAnchor(item, anchor))) {
      rows.push(commentBubble(comment, env.onRemove, env.colspan));
      env.placed.add(comment.id);
    }
    if (env.box && sameAnchor(env.box.anchor, anchor)) rows.push(commentBox(env.box, env, env.colspan));
  }
  return rows;
}
