/**
 * File viewer: a click on a file path in a tool row opens the file's current text with line numbers, the lines the
 * tool read or wrote highlighted and scrolled into view. Read-only; content is shown as plain text, never as HTML.
 */
import { api } from './api.js';
import { h, copyText } from './dom.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { canOpenInFiles, openInFiles } from './files/open-in-files.js';

const MAX_RENDERED_LINES = 20000;
const targets = new WeakMap(); // open button -> { path, highlight }

/** @typedef {{from:number, to:number}|{needles:string[]}|'all'|null} Highlight */

/** What to open for a tool call, or null for tools that do not name one file. @returns {{path:string, highlight:Highlight}|null} */
function fileTarget(name, input) {
  if (name === 'Read' && input.file_path) {
    const from = Number(input.offset) || 1;
    return { path: input.file_path, highlight: input.offset || input.limit ? { from, to: from + (Number(input.limit) || 1) - 1 } : null };
  }
  if (name === 'Edit' && input.file_path) return { path: input.file_path, highlight: { needles: [input.new_string || ''] } };
  if (name === 'MultiEdit' && input.file_path) return { path: input.file_path, highlight: { needles: (input.edits || []).map(edit => edit.new_string || '') } };
  if (name === 'Write' && input.file_path) return { path: input.file_path, highlight: 'all' };
  if (name === 'NotebookEdit' && input.notebook_path) return { path: input.notebook_path, highlight: null };
  return null;
}

/**
 * A small "open in viewer" button for a tool row's summary, or null when the tool names no file.
 * @param {string} name tool name @param {object} input tool input @returns {HTMLButtonElement|null}
 */
export function fileOpenButton(name, input) {
  const target = fileTarget(name, input || {});
  return target ? fileLinkButton(target.path, target.highlight) : null;
}

/** "Open in viewer" button for a path (handled by enableFileLinks). @param {string} path @param {Highlight} highlight */
export function fileLinkButton(path, highlight = null) {
  // data-file-path: right click gives the file menu (context-menu/file-menu.js)
  const button = h('button', { type: 'button', class: 'open-file', title: `פתיחה בצופה: ${path}`, dataset: { openFile: '', filePath: path } }, icon('external'));
  targets.set(button, { path, highlight });
  return button;
}

/** Line numbers (1-based) to highlight in `lines`. */
function highlightedLines(lines, highlight) {
  if (highlight === 'all') return new Set(lines.map((line, index) => index + 1));
  if (highlight?.from) return new Set(Array.from({ length: Math.max(0, highlight.to - highlight.from + 1) }, (unused, index) => highlight.from + index));
  const marked = new Set();
  const text = lines.join('\n');
  for (const needle of highlight?.needles || []) {
    const at = needle.trim() ? text.indexOf(needle) : -1;
    if (at === -1) continue; // changed again since: show the file without a mark
    const first = text.slice(0, at).split('\n').length;
    needle.split('\n').forEach((unused, index) => marked.add(first + index));
  }
  return marked;
}

/**
 * Opens the viewer for a file of a session.
 * @param {string} sessionId @param {string} path @param {Highlight} highlight
 */
export async function openFileViewer(sessionId, path, highlight) {
  let file;
  try {
    file = await api.viewFile(sessionId, path);
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  const lines = file.content.split('\n');
  if (lines.length > 1 && lines.at(-1) === '') lines.pop(); // the newline that ends the last line is not a line
  const marked = highlightedLines(lines, highlight);
  const body = h('div', { class: 'file-lines', dir: 'ltr' }, lines.slice(0, MAX_RENDERED_LINES).map((text, index) => h('div', {
    class: `file-line${marked.has(index + 1) ? ' marked' : ''}`,
  }, h('span', { class: 'line-no' }, String(index + 1)), h('span', { class: 'line-text' }, text))));
  const dialog = h('dialog', { class: 'file-viewer', 'aria-label': file.path });
  const close = () => { dialog.close(); dialog.remove(); };
  const notes = [file.truncated ? `מוצגים 2MB הראשונים מתוך ${Math.round(file.size / 1048576)}MB.` : '',
    lines.length > MAX_RENDERED_LINES ? `מוצגות ${MAX_RENDERED_LINES} השורות הראשונות.` : ''].filter(Boolean).join(' ');
  dialog.append(h('div', { class: 'file-viewer-head' },
    icon('file'), h('code', { class: 'file-path', dir: 'ltr', title: file.path }, file.path),
    h('span', { class: 'file-meta' }, `${file.totalLines} שורות${marked.size ? ` · ${marked.size} מסומנות` : ''}`),
    h('button', { type: 'button', class: 'icon-button', title: 'העתקת הנתיב', onClick: async () => { await copyText(file.path); toast('הנתיב הועתק'); } }, icon('copy')),
    h('button', { type: 'button', class: 'icon-button', title: 'העתקת התוכן', onClick: async () => { await copyText(file.content); toast('התוכן הועתק'); } }, icon('file')),
    canOpenInFiles(sessionId) ? h('button', { type: 'button', class: 'btn small', title: 'פתיחה בחלונית הקבצים לעריכה', onClick: () => { close(); openInFiles(sessionId, file.path); } }, icon('pencil'), 'עריכה') : null,
    h('button', { type: 'button', class: 'icon-button', title: 'סגירה (Esc)', onClick: close }, icon('x'))),
  ...(notes ? [h('div', { class: 'file-note' }, notes)] : []), body); // native append would print a null as "null"
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('mousedown', event => { if (event.target === dialog) close(); });
  document.body.append(dialog);
  dialog.showModal();
  body.querySelector('.file-line.marked')?.scrollIntoView({ block: 'center' });
}

/**
 * Opens the viewer from the "open" buttons inside a container (one delegated listener).
 * @param {HTMLElement} container the thread's message list
 * @param {() => string|null} getSessionId the session on screen
 */
export function enableFileLinks(container, getSessionId) {
  container.addEventListener('click', event => {
    const button = event.target.closest('[data-open-file]');
    const target = button && targets.get(button);
    if (!target) return;
    event.preventDefault(); // the button sits in a <summary>: do not also open/close the tool row
    event.stopPropagation();
    const sessionId = getSessionId();
    if (sessionId) openFileViewer(sessionId, target.path, target.highlight);
  });
}
