/**
 * Changes pane (Claude Code Desktop's diff view): the session folder's uncommitted changes file by file; a "+" beside a
 * line number adds a comment, and Ctrl+Enter sends all comments to Claude as one message.
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { parseDiff } from './diff-parse.js';
import { renderDiffFile, renderUnplacedComments } from './diff-view.js';
import { changesToolbar, changesNotes, changesFooter } from './changes-chrome.js';
import { commentsOf, addComment, removeComment, clearComments, composeMessage } from './diff-comments.js';
import { createSessionFetch } from './session-fetch.js';
import { notRepoText } from './pane-details.js';
import { joinPath } from '../context-menu/paths.js';

/**
 * @param {{send:(text:string)=>Promise<boolean>, rerender:()=>void}} deps send: the normal send path (queues while
 *   Claude works); rerender: draws the panes again
 * @returns {import('./pane-host.js').PaneDefinition}
 */
export function createChangesPane({ send, rerender }) {
  const diffs = createSessionFetch(id => api.sessionDiff(id).then(result => ({ ...result, files: parseDiff(result.diff || '') })),
    error => ({ error: error.message, files: [] }));
  const collapsed = new Set(); // "session|path"
  const fileNodes = new Map(); // path -> its <section> on screen
  let body = null;
  let session = null;
  let shown = { id: null, key: null }; // what is drawn: a refetch with the same content draws nothing
  let data = null;
  let box = null; // the open comment box: { sessionId, anchor, draft, focus }
  let sendingFor = null; // the session whose comments are on their way (one send at a time)
  let frame = { toolbar: null, unplaced: null, footer: null };

  const commentsHere = () => commentsOf(session.id);
  const keepFocus = () => body.focus({ preventScroll: true }); // Ctrl+Enter reaches the pane only while it has focus
  const fileFor = path => data.files.find(file => file.path === path);

  function fileNode(file) {
    const key = `${session.id}|${file.path}`;
    const myBox = box && box.sessionId === session.id && box.anchor.path === file.path ? box : null;
    return renderDiffFile(file, {
      comments: commentsHere().filter(comment => comment.path === file.path), box: myBox, collapsed: collapsed.has(key),
      fullPath: joinPath(data.root, file.path), // the diff's paths are from the repository's top (the file menu needs them whole)
      onToggle: () => { if (!collapsed.delete(key)) collapsed.add(key); redrawFile(file.path); keepFocus(); },
      onComment: anchor => openBox(anchor),
      onInput: text => { if (box) box.draft = text; },
      onAdd: comment => { addComment(session.id, comment); box = null; redrawFile(file.path); keepFocus(); },
      onCancel: () => { box = null; redrawFile(file.path); keepFocus(); },
      onRemove: id => { removeComment(session.id, id); redrawFile(file.path); keepFocus(); },
    });
  }

  /** Draws one file again (and the frame's counts), not the whole pane: big diffs stay fast. */
  function redrawFile(path) {
    const file = fileFor(path);
    if (file && fileNodes.has(path)) {
      const node = fileNode(file);
      fileNodes.get(path).replaceWith(node);
      fileNodes.set(path, node);
    }
    redrawFrame();
  }

  function openBox(anchor) {
    const previous = box?.anchor.path;
    box = { sessionId: session.id, anchor, draft: '', focus: true };
    if (previous && previous !== anchor.path) redrawFile(previous);
    redrawFile(anchor.path);
    box.focus = false; // focus once; later redraws keep focus only where it already is
  }

  function redrawFrame() {
    const paths = new Set(data.files.map(file => file.path));
    const next = {
      toolbar: changesToolbar(data, commentsHere().length, () => diffs.get(session, rerender, true)),
      unplaced: renderUnplacedComments(commentsHere().filter(comment => !paths.has(comment.path)), 'הערות על קבצים שכבר אינם בשינויים:', id => {
        removeComment(session.id, id);
        redrawFrame();
        keepFocus();
      }) || h('div', { hidden: true }),
      footer: changesFooter(commentsHere().length, {
        onClear: () => { clearComments(session.id); drawAll(); keepFocus(); }, onSend: submit, sending: sendingFor === session.id }),
    };
    for (const part of Object.keys(next)) { frame[part]?.replaceWith(next[part]); }
    frame = next;
  }

  function drawAll() {
    fileNodes.clear();
    const message = text => body.replaceChildren(h('p', { class: 'detail-muted' }, text));
    if (!data) return message('טוען…');
    if (data.error) return body.replaceChildren(h('div', { class: 'error-box' }, data.error));
    if (!data.isRepo) return message(notRepoText(data));
    frame = { toolbar: h('div'), unplaced: h('div'), footer: h('div') };
    const files = data.files.map(file => { const node = fileNode(file); fileNodes.set(file.path, node); return node; });
    body.replaceChildren(frame.toolbar, ...changesNotes(data), frame.unplaced,
      files.length ? h('div', { class: 'diff-files' }, files) : h('p', { class: 'detail-muted' }, 'אין שינויים שלא נשמרו ב-commit.'), frame.footer);
    return redrawFrame();
  }

  async function submit() {
    if (sendingFor) return; // a held key or a double click sends once
    const sessionId = session.id; // the user may switch sessions while the message is on its way
    if (box?.sessionId === sessionId && box.draft.trim()) {
      const path = box.anchor.path;
      addComment(sessionId, { ...box.anchor, text: box.draft.trim() });
      box = null;
      redrawFile(path); // the box (and its textarea) leaves the screen now, not after the send
    }
    const comments = commentsOf(sessionId);
    if (!comments.length) return;
    sendingFor = sessionId;
    redrawFrame();
    const sent = await send(composeMessage(comments));
    sendingFor = null;
    if (sent) clearComments(sessionId);
    if (session.id === sessionId) drawAll();
  }

  return {
    id: 'changes', title: 'שינויים', icon: 'diff',
    render(element, current) {
      if (body !== element) {
        body = element;
        body.tabIndex = -1;
        // Ctrl+Enter sends the comments; on the pane, not the page: the composer has its own Ctrl+Enter.
        body.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); } });
      }
      session = current;
      data = diffs.get(current, rerender);
      const key = data ? `${data.isRepo}|${data.error ?? ''}|${data.diff ?? ''}` : 'loading';
      if (shown.id === current.id && shown.key === key) return;
      shown = { id: current.id, key };
      const typing = body.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA';
      const hadFocus = body.contains(document.activeElement);
      if (box) box.focus = typing; // the changed diff is drawn again; a half-typed comment keeps its text and focus
      drawAll();
      if (box) box.focus = false;
      if (hadFocus && !typing) keepFocus();
    },
  };
}
