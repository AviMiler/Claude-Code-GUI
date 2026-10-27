/** The Changes pane's frame around the files: the toolbar (counts, refresh), notes about what is not shown, and the footer that sends the comments. */
import { h } from '../dom.js';
import { icon } from '../icons.js';

/** @param {{files:object[]}} data @param {number} commentCount @param {()=>void} onRefresh @returns {HTMLElement} */
export function changesToolbar(data, commentCount, onRefresh) {
  const added = data.files.reduce((sum, file) => sum + file.added, 0);
  const removed = data.files.reduce((sum, file) => sum + file.removed, 0);
  return h('div', { class: 'changes-toolbar' },
    h('span', null, `${data.files.length} קבצים`),
    h('span', { class: 'diff-counts', dir: 'ltr' }, h('span', { class: 'added' }, `+${added}`), h('span', { class: 'removed' }, `−${removed}`)),
    h('span', { class: 'spacer' }),
    commentCount ? null : h('span', { class: 'changes-hint' }, '+ ליד מספר שורה מוסיף הערה'),
    h('button', { type: 'button', class: 'icon-button', title: 'רענון', onClick: onRefresh }, icon('refresh')));
}

/** @param {{truncated?:boolean, newFilesSkipped?:number}} data @returns {HTMLElement[]} */
export function changesNotes(data) {
  return [
    data.truncated ? h('p', { class: 'detail-muted' }, 'השינויים גדולים מדי – מוצג רק חלקם.') : null,
    data.newFilesSkipped
      ? h('p', { class: 'detail-muted' }, `${data.newFilesSkipped} קבצים חדשים לא מוצגים (גדולים, רבים מדי או קיצורי דרך).`) : null,
  ].filter(Boolean);
}

/**
 * @param {number} count @param {{onClear:()=>void, onSend:()=>void, sending:boolean}} handlers
 * @returns {HTMLElement} empty when there is nothing to send (kept in the DOM so it can be replaced in place)
 */
export function changesFooter(count, { onClear, onSend, sending }) {
  if (!count) return h('div', { class: 'changes-footer', hidden: true });
  return h('div', { class: 'changes-footer' }, h('span', null, `${count} הערות`), h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'btn ghost small', onClick: onClear }, 'ניקוי'),
    h('button', { type: 'button', class: 'btn primary small', title: 'Ctrl+Enter', disabled: sending, onClick: onSend },
      icon('arrow-up'), 'שליחה ל-Claude'));
}
