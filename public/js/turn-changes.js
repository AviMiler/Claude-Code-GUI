/**
 * "Files changed in this turn" card shown after each turn's result: which files Claude's edit tools wrote, with line
 * counts, and that turn's diffs on click. Recomputed from the session's items; nothing extra is stored.
 */
import { h, folderName } from './dom.js';
import { icon } from './icons.js';
import { diffLines, renderDiff } from './render-tools.js';
import { fileLinkButton } from './file-viewer.js';

/** Diff lines of one tool call, or null for tools that do not write files. */
function diffsOf(item) {
  const input = item.input || {};
  if (item.name === 'Edit') return [diffLines(input.old_string ?? '', input.new_string ?? '')];
  if (item.name === 'MultiEdit') return (input.edits || []).map(edit => diffLines(edit.old_string ?? '', edit.new_string ?? ''));
  if (item.name === 'Write') return [String(input.content ?? '').split('\n').map(text => ({ type: 'add', text }))];
  if (item.name === 'NotebookEdit') return [String(input.new_source ?? '').split('\n').map(text => ({ type: 'add', text }))];
  return null;
}

/**
 * Files written by the turn that ends at `resultIndex` (from the last user message up to it).
 * Calls whose tool result is an error (denied or failed) are left out; several edits of one file are merged.
 * @param {object[]} items session.items
 * @param {number} resultIndex index of the turn's `result` item
 * @returns {{path:string, added:number, removed:number, written:boolean, diffs:object[][]}[]} in order of first change
 * @example turnChanges(session.items, 12) // [{ path: 'C:\\repo\\app.js', added: 2, removed: 1, written: false, diffs }]
 */
export function turnChanges(items, resultIndex) {
  let start = resultIndex;
  while (start > 0 && items[start - 1].kind !== 'user') start -= 1;
  const turn = items.slice(start, resultIndex);
  const failed = new Set(turn.filter(item => item.kind === 'tool-result' && item.isError).map(item => item.toolUseId));
  const files = new Map();
  for (const item of turn) {
    if (item.kind !== 'tool' || failed.has(item.id)) continue;
    const diffs = diffsOf(item);
    const path = item.input?.file_path || item.input?.notebook_path;
    if (!diffs || !path) continue;
    const file = files.get(path) || { path, added: 0, removed: 0, written: false, diffs: [] };
    for (const lines of diffs) {
      file.added += lines.filter(line => line.type === 'add').length;
      file.removed += lines.filter(line => line.type === 'del').length;
      file.diffs.push(lines);
    }
    file.written ||= item.name === 'Write';
    files.set(path, file);
  }
  return [...files.values()];
}

/**
 * @param {ReturnType<typeof turnChanges>} changes
 * @param {{onOpenGit:()=>void}} handlers opens the Changes pane (all uncommitted changes in the folder)
 * @returns {HTMLElement|null} null when the turn changed no files
 */
export function renderTurnChanges(changes, { onOpenGit }) {
  if (!changes.length) return null;
  const rows = changes.map(file => {
    const diffBox = h('div', { class: 'turn-change-diff', hidden: true }, ...file.diffs.map(renderDiff));
    const toggle = h('button', { type: 'button', class: 'turn-change', title: file.path, 'aria-expanded': 'false', onClick: () => {
      diffBox.hidden = !diffBox.hidden;
      toggle.setAttribute('aria-expanded', String(!diffBox.hidden));
    } }, icon('file'), h('span', { class: 'name', dir: 'ltr' }, folderName(file.path)),
    file.written ? h('span', { class: 'badge' }, 'נכתב') : null,
    h('span', { class: 'added' }, `+${file.added}`), h('span', { class: 'removed' }, `−${file.removed}`));
    // Each diff's added block, as it should now read in the file (the viewer marks where it is found).
    const blocks = file.diffs.map(lines => lines.filter(line => line.type === 'add').map(line => line.text).join('\n')).filter(Boolean);
    return h('div', null, h('div', { class: 'turn-change-row' }, toggle, fileLinkButton(file.path, blocks.length ? { needles: blocks } : null)), diffBox);
  });
  const all = h('button', { type: 'button', class: 'link-button', onClick: () => {
    const open = rows.some(row => row.querySelector('.turn-change-diff').hidden);
    rows.forEach(row => { row.querySelector('.turn-change-diff').hidden = !open; row.querySelector('.turn-change').setAttribute('aria-expanded', String(open)); });
  } }, 'הכול');
  return h('div', { class: 'turn-changes', title: 'קבצים שכלי העריכה של Claude כתבו בתור הזה. שינויים מפקודות טרמינל מופיעים בחלונית השינויים.' },
    h('div', { class: 'turn-changes-head' }, icon('diff'), h('b', null, changes.length === 1 ? 'שונה קובץ אחד' : `שונו ${changes.length} קבצים`),
      h('span', { class: 'spacer' }), all, h('button', { type: 'button', class: 'link-button', onClick: onOpenGit }, 'כל השינויים')),
    ...rows);
}
