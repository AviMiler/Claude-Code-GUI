/** Frontend entry point: receives live events, keeps the views in sync, and wires the composer and menus. */
import { api, subscribe } from './api.js';
import { state, activeSession, getCommands, getModels, peekModels, modelLabel } from './state.js';
import { createThread } from './thread.js';
import { createMainComposer } from './main-composer.js';
import { renderSidebar } from './sidebar.js';
import { renderTopbar, renderWelcome } from './chrome.js';
import { renderPromptCards } from './prompt-cards.js';
import { createActions } from './actions.js';
import { createCommandRunner } from './command-runner.js';
import { findCommand } from './command-catalog.js';
import { applyTheme, toast } from './ui.js';
import { handleEvent } from './events.js';
import { renderPageStatus, watchPageVisibility } from './page-status.js';
import { createSideQuestions } from './side-question.js';
import { createSearchHits } from './search-hits.js';
import { enableFileLinks } from './file-viewer.js';
import { createModelHealth } from './model-health.js';
import { createSplitView } from './split-view.js';
import { prefetchCatalog } from './warm-up.js';
import { createPanes } from './panes/panes.js';
import { bindShortcuts } from './shortcuts/bind-shortcuts.js';
import { viewModeLabel } from './transcript/view-mode.js';

applyTheme();
const byId = id => document.getElementById(id);
const els = {
  app: byId('app'), list: byId('session-list'), search: byId('session-search'), topbar: byId('topbar'), scroller: byId('thread'),
  messages: byId('messages'), welcome: byId('welcome'), cards: byId('prompt-cards'), composerArea: byId('composer-area'), version: byId('version-label'), brand: byId('brand'),
};
const thread = createThread({ scroller: els.scroller, messages: els.messages, onOpenGit: () => panes.open('changes') });
const sideQuestions = createSideQuestions(els.composerArea);
const searchHits = createSearchHits({ scroller: els.scroller, messages: els.messages });
enableFileLinks(els.messages, () => state.activeId);
const modelHealth = createModelHealth(byId('model-health'));
const split = createSplitView({ app: els.app, pane: byId('split-pane'), selectMain: id => selectSession(id), openChanges: () => panes.open('changes'), onChange: () => refresh() });
const panes = createPanes({ workspace: byId('workspace'), area: byId('pane-area'), openPanel: id => actions.openPanel(id), modelLabel,
  getSession: activeSession, send: text => actions.send(text), onChange: () => refresh() });
const actions = createActions({ refresh: () => refresh(), selectSession: id => selectSession(id),
  insert: (text, options) => composer.insert(text, options), restore: entries => composer.restore(entries),
  askSide: (sessionId, question) => sideQuestions.ask(sessionId, question), composerText: () => composer.textarea.value });
const runCommand = createCommandRunner(actions);

const composer = createMainComposer(els.composerArea, { actions, runCommand });

/** Re-renders everything that depends on the active session (cheap: no thread re-render). */
function refresh() {
  const session = activeSession();
  renderSidebar(els.list, { ...state, filter: els.search.value, onSelect: openFromSidebar, actions, onRegroup: refresh });
  // Never rebuild a bar or page the user is typing in (title, folder); it would lose the edit. A focused button is no edit.
  const typing = document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
  const editing = node => typing && node.contains(document.activeElement) && node.dataset.sessionId === String(session?.id ?? '');
  if (!editing(els.topbar)) renderTopbar(els.topbar, session, {
    onToggleSidebar: toggleSidebar, onRename: name => actions.rename(name), onOpenPanel: id => actions.openPanel(id),
    onFork: () => actions.fork(), onClear: () => actions.clear(), onExport: () => actions.exportChat(),
    onFocus: () => actions.toggleFocus(), onDelete: () => actions.remove(), onSplit: () => split.toggle(), onPin: () => session && actions.setPinned(session.id, !session.pinned),
    onArchive: () => actions.archive(), onUnarchive: () => actions.unarchive(),
    onToggleDetails: () => panes.toggle('details'), detailsOpen: panes.isOpen('details'),
    onToggleChanges: () => panes.toggle('changes'), changesOpen: panes.isOpen('changes'),
    viewMode: () => thread.view.mode(), onViewMode: mode => thread.view.setMode(mode),
  });
  els.topbar.dataset.sessionId = els.welcome.dataset.sessionId = String(session?.id ?? '');
  els.welcome.hidden = Boolean(session);
  els.messages.hidden = !session;
  if (!session && !editing(els.welcome)) {
    renderWelcome(els.welcome, {
      cwd: state.draft.cwd, defaultCwd: state.config.defaultCwd,
      onFolder: cwd => { state.draft.cwd = cwd; prefetchCatalog(); },
      onSuggestion: async text => { const command = findCommand(await getCommands(), text.slice(1)); if (command) runCommand(command, '', { fromMenu: true }); },
    });
  }
  const settings = session || state.draft;
  composer.update({ mode: settings.mode, modelLabel: modelLabel(settings), modelSwitchable: peekModels()?.switchable ?? true, isRunning: session?.status === 'running',
    contextPercent: session ? state.context.get(session.id) ?? -1 : -1, hasSession: Boolean(session), queue: session?.queue || [] });
  const cardsBefore = els.cards.childElementCount;
  renderPromptCards(els.cards, session?.pendingPermissions || [], (prompt, answer) => actions.answerPermission(prompt, answer));
  if (els.cards.childElementCount > cardsBefore) thread.scrollToEnd(); // a new request shrinks the thread; keep its end visible
  renderPageStatus(els.brand);
  split.refresh();
  panes.refresh();
}
watchPageVisibility(refresh);

const ACTIVE_KEY = 'claude-gui.active-session';

/** A sidebar click; a search result also jumps to the matching messages. */
function openFromSidebar(id, hit) {
  selectSession(id);
  if (hit) searchHits.show(hit.indexes, hit.query);
}

function selectSession(id) {
  state.activeId = state.sessions.has(id) ? id : null;
  try { localStorage.setItem(ACTIVE_KEY, state.activeId || ''); } catch { /* storage may be blocked */ }
  state.unread.delete(id);
  sideQuestions.sessionChanged(state.activeId);
  searchHits.clear();
  thread.show(activeSession());
  refresh();
  composer.focus();
  prefetchCatalog();
}

function toggleSidebar() {
  els.app.classList.toggle('sidebar-collapsed');
}

async function loadState() {
  const { sessions, config, capabilities } = await api.state();
  state.sessions = new Map(sessions.map(session => [session.id, session]));
  state.config = config;
  state.capabilities = capabilities;
  state.draft.cwd ||= config.defaultCwd;
  els.version.textContent = capabilities.version ? `Claude Code ${capabilities.version}` : 'Claude Code לא זוהה';
  if (capabilities.error) els.version.title = capabilities.error;
  let remembered = null;
  try { remembered = localStorage.getItem(ACTIVE_KEY); } catch { /* storage may be blocked */ }
  selectSession(state.activeId || remembered);
  getModels().then(refresh).catch(() => {});
}

// ifRunning: the context ring must never start a CLI process by itself (e.g. right after one crashed).
const eventView = { thread, refresh, selectSession, onTurnFailed: () => modelHealth.afterFailedTurn(), paneThread: id => split.threadFor(id), fetchContext: id => api.control({ sessionId: id }, 'get_context_usage', { ifRunning: true })
  .then(usage => { if (!usage) return; state.context.set(id, usage.percentage ?? Math.round((usage.totalTokens / usage.maxTokens) * 100)); refresh(); })
  .catch(() => {}) };
subscribe(event => handleEvent(event, eventView), () => loadState().catch(error => console.error('[app] cannot load state:', error)));

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
  slashMenu: () => composer.insert('/', { replace: !composer.textarea.value }), newSession: () => selectSession(null),
  toggleSidebar, settings: () => actions.openPanel('model'), toggleSplit: () => split.toggle(),
  toggleChanges: () => panes.toggle('changes'), closePane: () => panes.closeFocused(),
  cycleView: () => { if (activeSession()) toast(`תצוגת תמליל: ${viewModeLabel(thread.view.cycle())}`); },
  stop: () => actions.stop(), isRunning: () => activeSession()?.status === 'running',
});
els.scroller.addEventListener('scroll', () => els.topbar.classList.toggle('scrolled', els.scroller.scrollTop > 4));
