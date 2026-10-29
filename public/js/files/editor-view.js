/** The Files pane's editor: a plain text area with a header (back, name, unsaved mark, save), notes and a status line. */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { isDirty } from './editor-store.js';

/** Line and column (1-based) of the caret. */
function caretPosition(textarea) {
  const before = textarea.value.slice(0, textarea.selectionStart);
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

/**
 * @param {{onInput:(text:string)=>void, onSave:()=>void, onBack:()=>void, onOverwrite:()=>void, onReload:()=>void}} handlers
 * @returns {{node:HTMLElement, show:(state:object)=>void, sync:(state:object)=>void, focus:()=>void}}
 *   show: puts the open file's draft in the box; sync: updates the marks and notes around it without touching the text
 */
export function createEditorView({ onInput, onSave, onBack, onOverwrite, onReload }) {
  const name = h('code', { class: 'editor-name', dir: 'ltr' });
  const mark = h('span', { class: 'editor-dirty', title: 'שינויים שלא נשמרו', hidden: true }, '●');
  const save = h('button', { type: 'button', class: 'btn small primary', title: 'שמירה (Ctrl+S)', onClick: onSave }, icon('check'), 'שמירה');
  const notes = h('div', { class: 'editor-notes' });
  const textarea = h('textarea', { class: 'file-editor', dir: 'ltr', wrap: 'off', spellcheck: false, 'aria-label': 'עורך הקובץ' });
  const status = h('div', { class: 'editor-status', dir: 'ltr' });
  const node = h('div', { class: 'file-editor-view' },
    h('div', { class: 'editor-head' }, h('button', { type: 'button', class: 'icon-button', title: 'חזרה לעץ הקבצים', onClick: onBack }, icon('arrow-up', 'back')), name, mark, h('span', { class: 'spacer' }), save),
    notes, textarea, status);
  let file = null;

  const updateStatus = () => {
    if (!file) return;
    const { line, column } = caretPosition(textarea);
    status.textContent = ['UTF-8', file.bom && 'BOM', file.eol.toUpperCase(), `שורה ${line}, עמודה ${column}`].filter(Boolean).join(' · ');
  };
  textarea.addEventListener('input', () => { onInput(textarea.value); updateStatus(); });
  for (const type of ['keyup', 'click', 'select']) textarea.addEventListener(type, updateStatus);
  textarea.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') { event.preventDefault(); onSave(); } // not the browser's "save page"
    else if (event.key === 'Escape') event.preventDefault(); // Esc here is not "stop Claude"
  });

  function sync(state) {
    file = state.file;
    if (!file) return;
    name.textContent = file.rel || file.path;
    name.title = file.path;
    mark.hidden = !isDirty(state);
    save.disabled = !file.writable || state.saving || !isDirty(state);
    textarea.readOnly = !file.writable;
    const conflict = state.conflict ? h('div', { class: 'editor-note conflict' }, 'הקובץ השתנה בדיסק מאז שנפתח (אולי על ידי Claude). ',
      h('button', { type: 'button', class: 'btn small danger', onClick: onOverwrite }, 'דריסה'),
      h('button', { type: 'button', class: 'btn small', title: 'טעינה מחדש מהדיסק; העריכה שלך תימחק', onClick: onReload }, 'טעינה מחדש')) : null;
    const readOnly = file.readOnlyReason ? h('div', { class: 'editor-note' }, `לקריאה בלבד: ${file.readOnlyReason}`) : null;
    notes.replaceChildren(...[conflict, readOnly].filter(Boolean));
    updateStatus();
  }

  return {
    node,
    show(state) { textarea.value = state.draft; textarea.scrollTop = 0; sync(state); },
    sync,
    focus: () => textarea.focus({ preventScroll: true }),
  };
}
