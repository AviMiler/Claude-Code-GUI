/** Frontend entry point: receives live events, keeps the views in sync, and wires the composer and menus. */
import { subscribe } from './api.js';
import { state, activeSession, getCommands, peekModels, modelLabel } from './state.js';
import { createThread } from './thread.js';
import { createMainComposer } from './main-composer.js';
import { renderSidebar } from './sidebar.js';
import { markSeen } from './sidebar/unread.js';
import { renderTopbar, renderWelcome } from './chrome.js';
import { renderPromptCards } from './prompt-cards.js';
import { createActions } from './actions.js';
import { createCommandRunner } from './command-runner.js';
import { findCommand } from './command-catalog.js';
import { applyTheme, toast } from './ui.js';
import { handleEvent } from './events.js';
import { renderPageStatus, watchPageVisibility } from './page-status.js';
import { crab } from './crab.js';
import { createSearchHits } from './search-hits.js'; import { createSessionFind } from './transcript/find-shortcut.js';
import { enableFileLinks } from './file-viewer.js';
import { createModelHealth } from './model-health.js';
import { createSplitView } from './split-view.js'; import { createFocusedPane } from './split-focused.js'; import { NEW_DRAFT } from './composer-drafts.js'; import { createSplitFocus, markSessionRows } from './split-focus.js';
import { prefetchCatalog } from './warm-up.js';
import { createPanes } from './panes/panes.js';
import { bindShortcuts } from './shortcuts/bind-shortcuts.js'; import { extraShortcuts } from './shortcuts/extra-actions.js'; import { chooseDraftFolder } from './folder-defaults.js';
import { enableFileMenus } from './context-menu/file-menu.js';
import { viewModeLabel } from './transcript/view-mode.js';
import { showLiveShells } from './terminal/shell-live.js';
import { contextInfo } from './context/context-info.js'; import { refreshContext } from './context/context-live.js';
import { createItemSync } from './sync/item-sync.js';
import { createStateLoader, rememberActive } from './sync/load-state.js'; import { watchSessionLinks, copySessionLink } from './sync/session-link.js';

applyTheme();
const byId = id => document.getElementById(id);
const els = {
  app: byId('app'), list: byId('session-list'), search: byId('session-search'), topbar: byId('topbar'), scroller: byId('thread'),
  messages: byId('messages'), welcome: byId('welcome'), cards: byId('prompt-cards'), composerArea: byId('composer-area'), version: byId('version-label'), brand: byId('brand'),
};
els.brand.prepend(crab());
const thread = createThread({ scroller: els.scroller, messages: els.messages, onOpenGit: () => panes.open('changes') });
const searchHits = createSearchHits({ scroller: els.scroller, messages: els.messages });
enableFileLinks(els.messages, () => state.activeId);
showLiveShells(els);
const modelHealth = createModelHealth(byId('model-health'));
const focus = createSplitFocus({ app: els.app, main: document.querySelector('.main'), pane: byId('split-pane'), onFocus: () => markSessionRows(els.list, marks()) }); // the side panes stay on the main session (spec: split view)
const marks = () => focus.marks(state.activeId, split.sessionId()); // the focused pane's session and the other visible one
const split = createSplitView({ app: els.app, pane: byId('split-pane'), selectMain: id => selectSession(id), openChanges: () => panes.open('changes'), onChange: () => refresh(), focus, askSide: (id, question) => panes.side.ask(id, question), focusSide: id => panes.side.focusInput(id), openPanel: id => actions.openPanel(id) });
const itemSync = createItemSync({ viewed: () => [state.activeId, split.sessionId()], threadsFor: id => [id === state.activeId ? thread : null, split.threadFor(id)].filter(Boolean) });
const panes = createPanes({ workspace: byId('workspace'), area: byId('pane-area'), modelLabel,
  getSession: activeSession, send: text => actions.send(text), onChange: () => refresh() });
const actions = createActions({ refresh: () => refresh(), selectSession: id => selectSession(id),
  insert: (text, options) => composer.insert(text, options), restore: entries => composer.restore(entries),
  askSide: (sessionId, question) => panes.side.ask(sessionId, question), composerText: () => composer.textarea.value, openInSplit: id => split.open(id) });
const runCommand = createCommandRunner(actions);

const composer = createMainComposer(els.composerArea, { actions, runCommand });
enableFileMenus({ insert: text => composer.insert(text) }); const pane = createFocusedPane({ focus, split, main: { composer, actions, area: els.composerArea, session: activeSession, messages: els.messages } }); // what the shortcuts act on
const find = createSessionFind({ pane, whenLoaded: id => itemSync.whenLoaded(id) }); // Ctrl+F

/** Re-renders everything that depends on the active session (cheap: no thread re-render). */
function refresh() {
  const session = activeSession();
  renderSidebar(els.list, { ...state, filter: els.search.value, onSelect: openFromSidebar, actions, onRegroup: refresh, ...marks(), onSplit: id => id !== state.activeId && split.open(id) });
  // Never rebuild a bar or page the user is typing in (title, folder); it would lose the edit. A focused button is no edit.
  const typing = document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
  const editing = node => typing && node.contains(document.activeElement) && node.dataset.sessionId === String(session?.id ?? '');
  if (!editing(els.topbar)) renderTopbar(els.topbar, session, {
    onToggleSidebar: toggleSidebar, onRename: name => actions.rename(name), onOpenPanel: id => actions.openPanel(id),
    onCopyLink: () => session && copySessionLink(session.id), onFork: () => actions.fork(), onClear: () => actions.clear(), onExport: () => actions.exportChat(),
    onFocus: () => actions.toggleFocus(), onDelete: () => actions.remove(), onSplit: () => split.toggle(), onPin: () => session && actions.setPinned(session.id, !session.pinned),
    onArchive: () => actions.archive(), onUnarchive: () => actions.unarchive(),
    onTogglePane: id => panes.toggle(id), paneOpen: id => panes.isOpen(id), paneActive: id => panes.isActive(id),
    viewMode: () => thread.view.mode(), onViewMode: mode => thread.view.setMode(mode),
  });
  els.topbar.dataset.sessionId = els.welcome.dataset.sessionId = String(session?.id ?? '');
  els.welcome.hidden = Boolean(session);
  els.messages.hidden = !session;
  if (!session && !editing(els.welcome)) {
    renderWelcome(els.welcome, {
      cwd: state.draft.cwd, defaultCwd: state.config.defaultCwd,
      onFolder: cwd => { chooseDraftFolder(cwd); prefetchCatalog(); setTimeout(refresh); },
      onSuggestion: async text => { const command = findCommand(await getCommands(), text.slice(1)); if (command) runCommand(command, '', { fromMenu: true }); },
    });
  }
  const settings = session || state.draft;
  composer.update({ mode: settings.mode, modelLabel: modelLabel(settings), fallbackModel: settings.fallbackModel, modelSwitchable: peekModels()?.switchable ?? true, isRunning: session?.status === 'running',
    contextPercent: contextInfo(session, refresh), hasSession: Boolean(session), queue: session?.queue || [], draftKey: session?.id ?? NEW_DRAFT });
  const cardsBefore = els.cards.childElementCount;
  renderPromptCards(els.cards, session?.pendingPermissions || [], (prompt, answer) => actions.answerPermission(prompt, answer));
  if (els.cards.childElementCount > cardsBefore) thread.scrollToEnd(); // a new request shrinks the thread; keep its end visible
  renderPageStatus(els.brand);
  split.refresh();
  panes.refresh();
  itemSync.watch(); // a session that came on screen (main, split, compare): subscribe to it and load its items
  find.sync(); // a pane that now shows another session closes its Ctrl+F bar
}
watchPageVisibility(refresh, () => [state.activeId, split.sessionId()]);

/** A sidebar click; a search result also jumps to the matching messages, once the session's items are loaded. */
function openFromSidebar(id, hit) {
  if (focus.sidebarClick(id, { activeId: state.activeId, splitId: split.sessionId(), openInSplit: split.open })) return; // the focused pane may be the split one
  selectSession(id);
  if (hit) itemSync.whenLoaded(id).then(() => { if (state.activeId === id) searchHits.show(hit.indexes, hit.query); });
}

function selectSession(id) {
  state.activeId = state.sessions.has(id) ? id : null;
  rememberActive(state.activeId);
  markSeen(id);
  searchHits.clear();
  thread.show(activeSession());
  refresh();
  composer.focus();
  prefetchCatalog();
}

function toggleSidebar() {
  els.app.classList.toggle('sidebar-collapsed');
}

const loadState = createStateLoader({ versionLabel: els.version, selectSession, refresh, itemSync });
watchSessionLinks(selectSession); // #session=<id> pasted into this tab

// The context reading never starts a CLI process by itself (ifRunning, context/context-live.js).
const eventView = { thread, refresh, selectSession, onTurnFailed: () => modelHealth.afterFailedTurn(), paneThread: id => split.threadFor(id),
  fetchContext: id => refreshContext(id, refresh), items: itemSync };
subscribe(event => handleEvent(event, eventView), () => loadState().catch(error => console.error('[app] cannot load state:', error)), itemSync.connected, itemSync.client);

byId('new-session').addEventListener('click', () => selectSession(null));
byId('open-settings').addEventListener('click', () => actions.openPanel('model'));
byId('theme-toggle').addEventListener('click', () => actions.openPanel('appearance'));
byId('collapse-sidebar').addEventListener('click', toggleSidebar);
// Searching reads every conversation; wait for a pause in typing. Enter opens the first result.
let searchTimer = null;
els.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(refresh, 150); });
els.search.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); clearTimeout(searchTimer); refresh(); els.list.querySelector('.session-row')?.click(); }
});
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => actions.openPanel(button.dataset.panel)));
bindShortcuts({
  slashMenu: () => { const box = pane.composer(); box.insert('/', { replace: !box.textarea.value }); }, newSession: () => selectSession(null),
  toggleSidebar, settings: () => actions.openPanel('model'), toggleSplit: () => split.toggle(), findInSession: () => find.findInSession(),
  toggleChanges: () => panes.toggle('changes'), toggleTerminal: () => panes.toggle('terminal'), closePane: () => panes.closeFocused(), closeFocusedPane: () => focus.closeFocused({ splitId: split.sessionId(), closeSplit: split.toggle, selectMain: selectSession }),
  cycleView: () => { if (activeSession()) toast(`תצוגת תמליל: ${viewModeLabel(thread.view.cycle())}`); },
  stop: () => pane.actions().stop(), isRunning: () => pane.session()?.status === 'running',
  ...extraShortcuts({ pane, side: id => panes.side.focusInput(id) }),
});
els.scroller.addEventListener('scroll', () => els.topbar.classList.toggle('scrolled', els.scroller.scrollTop > 4));
