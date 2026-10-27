/**
 * Split view: a second pane beside the main thread with another session — its live thread, its approval cards and a
 * compact composer (text, send, stop). The same session is never shown in both panes. Per browser (localStorage).
 */
import { api } from './api.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { state } from './state.js';
import { createThread } from './thread.js';
import { renderPromptCards } from './prompt-cards.js';
import { showDropdown } from './popover.js';
import { enableFileLinks } from './file-viewer.js';
import { toast } from './ui.js';
import { confirmOutwardCommand, isCancelled } from './risk.js';

const OPEN_KEY = 'claude-gui.split-open';
const SESSION_KEY = 'claude-gui.split-session';
const NARROW = matchMedia('(max-width: 1000px)');
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ } };
const recall = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };

/**
 * @param {{app:HTMLElement, pane:HTMLElement, selectMain:(id:string|null)=>void, openChanges:()=>void,
 *   onChange:()=>void}} options app gets the `split` class; pane is the empty <aside> to fill; selectMain opens a session
 *   in the main pane; onChange re-renders the page (sidebar dots, title) after the pane's session changed
 * @returns {{toggle:()=>void, refresh:()=>void, threadFor:(sessionId:string)=>object|null, sessionId:()=>string|null}}
 */
export function createSplitView({ app, pane, selectMain, openChanges, onChange }) {
  let sessionId = recall(SESSION_KEY) || null;
  let shownId = null; // the session the thread currently renders
  const title = h('button', { type: 'button', class: 'split-title', title: 'בחירת סשן לחלון הזה' });
  const scroller = h('section', { class: 'thread' });
  const messages = h('div', { class: 'thread-column messages', 'aria-live': 'polite' });
  scroller.append(messages);
  const cards = h('div', { class: 'prompt-cards' });
  const input = h('textarea', { rows: 1, dir: 'auto', placeholder: 'הודעה לסשן הזה…', 'aria-label': 'הודעה לסשן בחלון המפוצל' });
  const send = h('button', { type: 'button', class: 'send-button', title: 'שליחה (Enter)' }, icon('arrow-up'));
  const stop = h('button', { type: 'button', class: 'stop-button', title: 'עצירה', hidden: true }, icon('stop'));
  const swap = h('button', { type: 'button', class: 'icon-button', title: 'פתיחה בחלון הראשי (החלפה)' }, icon('sidebar'));
  const close = h('button', { type: 'button', class: 'icon-button', title: 'סגירת הפיצול (Ctrl+Shift+\\)' }, icon('x'));
  const empty = h('div', { class: 'split-empty' }, 'בחר סשן להצגה לצד הסשן הראשי.');
  // The thread's git button means "this session's changes": show the session in the main pane, then its git panel.
  const thread = createThread({ scroller, messages, onOpenGit: () => { swapPanes(); openChanges(); } });
  pane.append(h('div', { class: 'split-head' }, title, h('span', { class: 'spacer' }), swap, close), empty, scroller,
    h('div', { class: 'split-composer-area' }, cards, h('div', { class: 'split-composer' }, input, stop, send)));
  enableFileLinks(messages, () => shownId);

  // An archived session is not offered and leaves the pane empty (restore it, or open it in the main pane).
  const session = () => (sessionId && sessionId !== state.activeId && !state.sessions.get(sessionId)?.archived ? state.sessions.get(sessionId) || null : null);

  function choose(id) {
    sessionId = id;
    state.unread.delete(id); // on screen now
    remember(SESSION_KEY, id || '');
    onChange(); // also redraws this pane
    input.focus();
  }

  function pick() {
    const others = [...state.sessions.values()].filter(item => item.id !== state.activeId && !item.archived)
      .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    showDropdown(title, others.length ? others.map(item => ({ icon: 'message', title: item.name, desc: item.cwd,
      checked: item.id === sessionId, onSelect: () => choose(item.id) }))
      : [{ icon: 'info', title: 'אין סשנים נוספים', desc: 'צור סשן נוסף כדי להציג שניים זה לצד זה', disabled: true }], { placement: 'bottom' });
  }

  function swapPanes() {
    const current = session();
    if (!current) return;
    const previousMain = state.activeId;
    sessionId = previousMain; // set first: the main pane must not refuse it as "already shown"
    remember(SESSION_KEY, previousMain || '');
    selectMain(current.id);
  }

  async function submit() {
    const current = session();
    const text = input.value.trim();
    if (!current || !text) return;
    input.value = '';
    try {
      await confirmOutwardCommand(text); // the same warning as the main composer for commands that reach the cloud
      await api.sendMessage(current.id, text);
    } catch (error) {
      input.value = text;
      toast(error.message, isCancelled(error) ? 'info' : 'error');
    }
  }

  async function stopTurn() {
    const current = session();
    if (!current) return;
    const result = await api.stop(current.id).catch(error => { toast(error.message, 'error'); return null; });
    if (result?.queued?.length) input.value = [...result.queued.map(entry => entry.text), input.value].filter(Boolean).join('\n\n');
  }

  /** Re-renders the header, cards and composer state; re-renders the thread only when the session changed. */
  function refresh() {
    const open = app.classList.contains('split');
    if (!open) return;
    const current = session();
    if (current) pane.dataset.splitSession = current.id; else delete pane.dataset.splitSession; // context-menu/file-menu.js
    title.replaceChildren(icon('message'), h('span', { dir: 'auto' }, current ? current.name : 'בחירת סשן…'), icon('chevron-down'));
    empty.hidden = Boolean(current);
    scroller.hidden = !current;
    swap.disabled = !current;
    input.disabled = !current;
    if ((current?.id || null) !== shownId) { shownId = current?.id || null; thread.show(current); }
    stop.hidden = current?.status !== 'running';
    renderPromptCards(cards, current?.pendingPermissions || [], (prompt, answer) =>
      api.answerPermission(current.id, prompt.requestId, answer).catch(error => toast(error.message, 'error')));
  }

  function setOpen(open) {
    app.classList.toggle('split', open);
    pane.hidden = !open;
    remember(OPEN_KEY, open ? '1' : '');
    shownId = null;
    if (open) refresh();
  }

  title.addEventListener('click', pick);
  swap.addEventListener('click', swapPanes);
  close.addEventListener('click', () => setOpen(false));
  send.addEventListener('click', submit);
  stop.addEventListener('click', stopTurn);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(); }
  });
  NARROW.addEventListener('change', () => { if (NARROW.matches && app.classList.contains('split')) setOpen(false); });
  if (recall(OPEN_KEY) && !NARROW.matches) setOpen(true);

  return {
    toggle() {
      if (!app.classList.contains('split') && NARROW.matches) return toast('החלון צר מדי לפיצול. הרחב אותו ונסה שוב.');
      return setOpen(!app.classList.contains('split'));
    },
    /** Shows a session in the pane, opening the split first (a sidebar row's menu). */
    open(id) {
      if (!app.classList.contains('split') && NARROW.matches) return toast('החלון צר מדי לפיצול. הרחב אותו ונסה שוב.');
      if (!app.classList.contains('split')) setOpen(true);
      return choose(id);
    },
    refresh,
    /** The pane's thread when it shows this session (events.js sends it the session's live updates). */
    threadFor: id => (app.classList.contains('split') && id && id === shownId ? thread : null),
    sessionId: () => (app.classList.contains('split') ? shownId : null),
  };
}
