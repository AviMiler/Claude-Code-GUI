/**
 * Files pane (Claude Code Desktop's file view): the session folder as a tree, and a plain text editor for a file. Saving
 * writes the file in place; Claude is not told about an edit (the Changes pane shows it). Needs no model call.
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { ask, toast } from '../ui.js';
import { filesState, stateIds, isDirty, anyDirty } from './editor-store.js';
import { createSaver } from './file-saver.js';
import { createAutoSave, autoSaveEnabled, setAutoSaveEnabled } from './auto-save.js';
import { createTreeView } from './tree-view.js';
import { createTreeFilter } from './tree-filter.js';
import { createEditorView } from './editor-view.js';
import { registerFilesOpener } from './open-in-files.js';
import { openPreview } from '../preview/open-preview.js';

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
  const saver = createSaver({ onChange: (id, finished) => { if (session?.id === id) { editor.sync(filesState(id)); if (finished) rerender(); } } });
  const autoSave = createAutoSave({ getState: filesState, sessionIds: stateIds, save: (id, options) => saver.save(id, options) });
  const editor = createEditorView({
    onInput: text => { const st = state(); st.draft = text; st.saved = false; autoSave.touch(session.id); editor.sync(st); },
    onSave: () => (autoSaveEnabled() ? autoSave.flush(session.id) : saver.save(session.id)),
    onOverwrite: () => saver.save(session.id, { overwrite: true }), onBack: () => leaveFile(), onBlur: () => autoSave.flush(session.id),
    onReload: () => openFile(state().file.path, { force: true }),
    onPreview: previewSaved,
    onToggleAuto: on => { setAutoSaveEnabled(on); if (on) autoSave.flush(session.id); else autoSave.cancel(session.id); editor.sync(state()); },
    onCancel: async () => { if (await confirmDiscard()) { Object.assign(state(), { draft: state().file.content, error: null }); editor.show(state()); } },
  });
  window.addEventListener('beforeunload', event => { if (anyDirty()) { autoSave.flushAll({ keepalive: true }); event.preventDefault(); event.returnValue = ''; } });

  const state = () => filesState(session.id);

  /** Saves a pending auto-save edit first; asks before an edit that still is not saved is thrown away. @returns {Promise<boolean>} go on */
  async function confirmDiscard() {
    await autoSave.flush(session.id);
    if (!isDirty(state())) return true;
    return ask({ title: 'שינויים שלא נשמרו', text: 'הקובץ נערך ולא נשמר. להשליך את השינויים?', confirmLabel: 'השלכה', danger: true });
  }

  /** The Preview pane shows the file on disk: a pending edit is saved first, and nothing opens when that failed or conflicts. */
  async function previewSaved() {
    const id = session.id, st = state();
    if (isDirty(st)) await (autoSaveEnabled() ? autoSave.flush(id) : saver.save(id));
    if (session.id !== id || state() !== st || !st.file || st.error || st.conflict || isDirty(st)) return;
    openPreview(id, st.file.path);
  }

  async function openFile(path, { force = false } = {}) {
    if (!force && state().file?.path === path) { editor.focus(); return; } // already open: nothing to discard
    if (!force && !await confirmDiscard()) return;
    const id = session.id;
    try {
      const file = await api.openFile(id, path);
      const st = filesState(id);
      Object.assign(st, { file, draft: file.content, conflict: false, saving: null, error: null, saved: false });
    } catch (error) {
      toast(error.message, 'error');
      return;
    }
    if (session.id === id) { draw(true); editor.focus(); }
  }

  async function leaveFile() {
    if (!await confirmDiscard()) return;
    Object.assign(state(), { file: null, draft: '', conflict: false, error: null, saved: false });
    draw(true);
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
      if (session && session.id !== current.id) autoSave.flush(session.id); // a pending edit of the session we leave
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
