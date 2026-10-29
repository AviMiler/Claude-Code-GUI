/**
 * Files pane (Claude Code Desktop's file view): the session folder as a tree, and a plain text editor for a file. Saving
 * writes the file in place; Claude is not told about an edit (the Changes pane shows it). Needs no model call.
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { ask, toast } from '../ui.js';
import { invalidateSessionFetches } from '../panes/session-fetch.js';
import { filesState, isDirty, anyDirty } from './editor-store.js';
import { createTreeView } from './tree-view.js';
import { createTreeFilter } from './tree-filter.js';
import { createEditorView } from './editor-view.js';
import { registerFilesOpener } from './open-in-files.js';

/**
 * @param {{rerender:()=>void, openPane:(id:string)=>void}} deps rerender: draws the panes again (after a save, so the Changes
 *   pane fetches the new diff); openPane: shows this pane
 * @returns {import('../panes/pane-host.js').PaneDefinition}
 */
export function createFilesPane({ rerender, openPane }) {
  let body = null;
  let session = null;
  let drawnFor = null; // `${session id}|${path or ''}`: what the body shows now
  let wanted = null; // { sessionId, path }: a file other parts of the page asked to open
  let lastStatus = null;
  let filtered = null; // paths of the filter box, or null (the tree)
  let treeNode = null;
  const treeView = createTreeView({ onChange: () => { if (drawnFor && !state().file) drawTree(); } });
  const filter = createTreeFilter({ getSessionId: () => session.id, onResults: paths => { filtered = paths; drawTree(); } });
  const editor = createEditorView({
    onInput: text => { state().draft = text; editor.sync(state()); },
    onSave: () => save(false), onOverwrite: () => save(true), onBack: () => leaveFile(),
    onReload: () => openFile(state().file.path, { force: true }),
  });
  window.addEventListener('beforeunload', event => { if (anyDirty()) { event.preventDefault(); event.returnValue = ''; } });

  const state = () => filesState(session.id);

  /** Asks before an edit that was not saved is thrown away. @returns {Promise<boolean>} go on */
  async function confirmDiscard() {
    if (!isDirty(state())) return true;
    return ask({ title: 'שינויים שלא נשמרו', text: 'הקובץ נערך ולא נשמר. להשליך את השינויים?', confirmLabel: 'השלכה', danger: true });
  }

  async function openFile(path, { force = false } = {}) {
    if (!force && state().file?.path === path) { editor.focus(); return; } // already open: nothing to discard
    if (!force && !await confirmDiscard()) return;
    const id = session.id;
    try {
      const file = await api.openFile(id, path);
      const st = filesState(id);
      Object.assign(st, { file, draft: file.content, conflict: false, saving: false });
    } catch (error) {
      toast(error.message, 'error');
      return;
    }
    if (session.id === id) { draw(true); editor.focus(); }
  }

  async function leaveFile() {
    if (!await confirmDiscard()) return;
    Object.assign(state(), { file: null, draft: '', conflict: false });
    draw(true);
  }

  async function save(overwrite) {
    const st = state();
    const id = session.id;
    if (!st.file?.writable || st.saving) return;
    st.saving = true;
    editor.sync(st);
    try {
      const { path, hash, eol, bom } = st.file;
      const sent = st.draft; // typing while the request is out stays an unsaved edit
      const saved = await api.saveFile(id, { path, content: sent, baseHash: hash, eol, bom, overwrite });
      Object.assign(st.file, saved, { content: sent });
      st.conflict = false;
      invalidateSessionFetches(id); // the Changes pane and the rail show the edit
      toast('נשמר');
    } catch (error) {
      if (error.status === 412) st.conflict = true;
      else toast(error.message, 'error');
    }
    st.saving = false;
    if (session.id === id) { editor.sync(st); rerender(); }
  }

  function drawTree() {
    const st = state();
    if (!treeNode) treeNode = h('div', { class: 'tree-list' });
    const open = path => openFile(path);
    const rows = filtered
      ? (filtered.length ? filtered.map(path => h('button', { type: 'button', class: 'tree-row', title: path, onClick: () => open(path) }, icon('file'), h('span', { class: 'tree-name', dir: 'ltr' }, path)))
        : [h('div', { class: 'tree-note' }, 'לא נמצאו קבצים')])
      : treeView.rows(session, st, open);
    treeNode.replaceChildren(...rows);
  }

  function draw(full) {
    const st = state();
    const key = `${session.id}|${st.file ? st.file.path : ''}`;
    if (!full && key === drawnFor) return;
    drawnFor = key;
    if (st.file) { body.replaceChildren(editor.node); editor.show(st); return; }
    const hidden = h('button', { type: 'button', class: `icon-button${st.showHidden ? ' on' : ''}`, 'aria-pressed': String(st.showHidden), title: 'הצגת תיקיות של כלים ותלויות (node_modules ועוד)',
      onClick: () => { st.showHidden = !st.showHidden; hidden.classList.toggle('on', st.showHidden); drawTree(); } }, icon('eye'));
    const refresh = h('button', { type: 'button', class: 'icon-button', title: 'רענון', onClick: () => treeView.refresh(session.id) }, icon('refresh'));
    treeNode = null;
    filter.reset();
    filtered = null;
    drawTree();
    body.replaceChildren(h('div', { class: 'files-pane' }, h('div', { class: 'tree-bar' }, filter.node, hidden, refresh), treeNode));
  }

  registerFilesOpener((sessionId, path) => { wanted = { sessionId, path }; openPane('files'); rerender(); });

  return {
    id: 'files', title: 'קבצים', icon: 'folder',
    render(element, current) {
      const sameBody = body === element;
      body = element;
      const switched = !sameBody || !session || session.id !== current.id;
      session = current;
      if (wanted?.sessionId === current.id) { const { path } = wanted; wanted = null; openFile(path); }
      const st = state();
      // A turn ended: a file Claude changed shows its new text, unless there are unsaved edits (a save then asks).
      if (lastStatus === 'running' && current.status !== 'running' && st.file && !isDirty(st)) openFile(st.file.path, { force: true });
      lastStatus = current.status;
      draw(switched);
    },
  };
}
