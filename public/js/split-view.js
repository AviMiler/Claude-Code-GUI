/**
 * Split view: a second pane beside the main thread with another session — its live thread, its approval cards and a
 * full composer (split-composer.js: attachments, / and @ menus, chips, stop, queue, drafts, /btw) for ITS session. The same session is never shown in both panes. Per browser (localStorage).
 * Which pane has the focus is split-focus.js; opening or choosing a session here focuses this pane.
 */
import { api } from './api.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { state } from './state.js';
import { markSeen } from './sidebar/unread.js';
import { createThread } from './thread.js';
import { renderPromptCards } from './prompt-cards.js';
import { showDropdown } from './popover.js';
import { enableFileLinks } from './file-viewer.js';
import { toast } from './ui.js';
import { createSplitComposer } from './split-composer.js';
import { remember, recall, isNarrow, refuseWhenNarrow, onTooNarrow } from './split-guard.js';

const OPEN_KEY = 'claude-gui.split-open';
const SESSION_KEY = 'claude-gui.split-session';

/**
 * @param {{app:HTMLElement, pane:HTMLElement, selectMain:(id:string|null)=>void, openChanges:()=>void,
 *   onChange:()=>void, focus:{set:(where:'main'|'split')=>void}, askSide:Function, focusSide:Function, openPanel:Function}} options askSide / focusSide: the side question tab; focus: split-focus.js; app gets the `split` class; pane is the empty <aside> to fill; selectMain opens a session
 *   in the main pane; onChange re-renders the page (sidebar dots, title) after the pane's session changed
 * @returns {{toggle:()=>void, refresh:()=>void, threadFor:(sessionId:string)=>object|null, sessionId:()=>string|null, composer:object, actions:object, area:HTMLElement, session:()=>object|null}}
 */
export function createSplitView({ app, pane, selectMain, openChanges, onChange, focus, askSide, focusSide, openPanel }) {
  let sessionId = recall(SESSION_KEY) || null;
  let shownId = null; // the session the thread currently renders
  const title = h('button', { type: 'button', class: 'split-title', title: 'בחירת סשן לחלון הזה' });
  const scroller = h('section', { class: 'thread' });
  const messages = h('div', { class: 'thread-column messages', 'aria-live': 'polite' });
  scroller.append(messages);
  const cards = h('div', { class: 'prompt-cards' });
  const swap = h('button', { type: 'button', class: 'icon-button', title: 'פתיחה בחלון הראשי (החלפה)' }, icon('sidebar'));
  const close = h('button', { type: 'button', class: 'icon-button', title: 'סגירת הפיצול (Ctrl+Shift+\\)' }, icon('x'));
  const empty = h('div', { class: 'split-empty' }, 'בחר סשן להצגה לצד הסשן הראשי.');
  // The thread's git button means "this session's changes": show the session in the main pane, then its git panel.
  const area = h('div', { class: 'composer-area' });
  const thread = createThread({ scroller, messages, onOpenGit: () => { swapPanes(); openChanges(); } });
  pane.append(h('div', { class: 'split-head' }, title, h('span', { class: 'spacer' }), swap, close), empty, scroller,
    h('div', { class: 'split-composer-area' }, cards, area));
  enableFileLinks(messages, () => shownId);

  // An archived session is not offered and leaves the pane empty (restore it, or open it in the main pane).
  const session = () => (sessionId && sessionId !== state.activeId && !state.sessions.get(sessionId)?.archived ? state.sessions.get(sessionId) || null : null);
  const box = createSplitComposer(area, { session, refresh: () => onChange(), askSide, focusSide, openPanel });

  function choose(id) {
    sessionId = id;
    markSeen(id); // on screen now
    remember(SESSION_KEY, id || '');
    focus.set('split');
    onChange(); // also redraws this pane
    box.composer.focus();
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
    if ((current?.id || null) !== shownId) { shownId = current?.id || null; thread.show(current); }
    box.update(current);
    renderPromptCards(cards, current?.pendingPermissions || [], (prompt, answer) =>
      api.answerPermission(current.id, prompt.requestId, answer).catch(error => toast(error.message, 'error')));
  }

  function setOpen(open) {
    app.classList.toggle('split', open);
    pane.hidden = !open;
    remember(OPEN_KEY, open ? '1' : '');
    focus.set('main'); // a pane just opened or closed: the main pane has the focus until the user works in the other
    shownId = null;
    if (open) refresh();
  }

  title.addEventListener('click', pick);
  swap.addEventListener('click', swapPanes);
  close.addEventListener('click', () => setOpen(false));
  // The window got narrower than a split needs: close it cleanly. Its session stays in the sidebar, and the page redraws
  // (the sidebar's "also open" mark and the Ctrl+Alt+Down/Up stepping must not still treat it as visible).
  onTooNarrow(() => {
    if (!app.classList.contains('split')) return;
    setOpen(false);
    onChange();
    toast('הפיצול נסגר: החלון צר מדי');
  });
  if (recall(OPEN_KEY) && !isNarrow()) setOpen(true);

  return {
    toggle() {
      if (!app.classList.contains('split') && refuseWhenNarrow()) return;
      return setOpen(!app.classList.contains('split'));
    },
    /** Shows a session in the pane, opening the split first (a sidebar row's menu). */
    open(id) {
      if (!app.classList.contains('split') && refuseWhenNarrow()) return;
      if (!app.classList.contains('split')) setOpen(true);
      return choose(id);
    },
    refresh,
    /** The pane's thread when it shows this session (events.js sends it the session's live updates). */
    threadFor: id => (app.classList.contains('split') && id && id === shownId ? thread : null),
    /** The session the pane shows now (valid before the pane's own redraw); null when the split is closed or empty. */
    sessionId: () => (app.classList.contains('split') ? session()?.id || null : null),
    composer: box.composer, actions: box.actions, area, session,
  };
}
