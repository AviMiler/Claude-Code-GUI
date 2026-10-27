/** Frontend entry point: receives live events, keeps the views in sync, and wires the composer and menus. */
import { api, subscribe } from './api.js';
import { state, activeSession, currentScope, getCatalog, getCommands, getModels, peekModels } from './state.js';
import { createThread } from './thread.js';
import { createComposer } from './composer.js';
import { renderSidebar } from './sidebar.js';
import { renderTopbar, renderWelcome } from './chrome.js';
import { renderPromptCards } from './prompt-cards.js';
import { createActions } from './actions.js';
import { createCommandRunner } from './command-runner.js';
import { findCommand, parseSlash } from './command-catalog.js';
import { applyTheme } from './ui.js';
import { createChipMenus } from './chip-menus.js';
import { handleEvent } from './events.js';
import { renderPageStatus, watchPageVisibility } from './page-status.js';
import { createSideQuestions } from './side-question.js';
import { createSearchHits } from './search-hits.js';
import { enableFileLinks } from './file-viewer.js';
import { createModelHealth } from './model-health.js';

applyTheme();
const byId = id => document.getElementById(id);
const els = {
  app: byId('app'), list: byId('session-list'), search: byId('session-search'), topbar: byId('topbar'), scroller: byId('thread'),
  messages: byId('messages'), welcome: byId('welcome'), cards: byId('prompt-cards'), composerArea: byId('composer-area'), version: byId('version-label'), brand: byId('brand'),
};
const thread = createThread({ scroller: els.scroller, messages: els.messages, onOpenGit: () => actions.openPanel('diff') });
const sideQuestions = createSideQuestions(els.composerArea);
const searchHits = createSearchHits({ scroller: els.scroller, messages: els.messages });
enableFileLinks(els.messages, () => state.activeId);
const modelHealth = createModelHealth(byId('model-health'));
const actions = createActions({ refresh: () => refresh(), selectSession: id => selectSession(id),
  insert: (text, options) => composer.insert(text, options), restore: entries => composer.restore(entries),
  askSide: (sessionId, question) => sideQuestions.ask(sessionId, question), composerText: () => composer.textarea.value });
const runCommand = createCommandRunner(actions);

const composer = createComposer(els.composerArea, {
  async onSubmit(text, attachments = []) {
    if (attachments.length) return actions.send(text, attachments); // with attachments it is a message to Claude, never a GUI command
    const slash = parseSlash(text);
    const command = slash && findCommand(await getCommands(), slash.name);
    if (command && command.run !== 'send') { await runCommand(command, slash.args); return true; }
    return actions.send(text);
  },
  onStop: () => actions.stop(),
  onQueueRemove: entry => actions.removeQueued(entry),
  onQueueEdit: entry => actions.editQueued(entry),
  onQueueResume: () => actions.resumeQueue(),
  onCommand: command => runCommand(command, '', { fromMenu: true }),
  onCycleMode: () => actions.cycleMode(),
  onContext: () => actions.openPanel('usage'),
  getHistory: () => (activeSession()?.items || []).filter(item => item.kind === 'user').map(item => item.text),
  onTyping: () => warmUp(),
  ...createChipMenus({ actions, getComposer: () => composer }),
});

function modelLabel(settings) {
  const value = settings.model || state.config.model || peekModels()?.current || state.runtime.get(settings.id)?.model || '';
  return value || 'ברירת מחדל';
}

// Starting Claude Code takes seconds; it starts while the first words are typed, so Enter does not wait for it.
let lastWarm = { key: '', at: 0 };
function warmUp() {
  const session = activeSession();
  if (session?.status === 'running') return;
  const { draft } = state;
  const target = session ? { sessionId: session.id }
    : { cwd: draft.cwd || state.config.defaultCwd, mode: draft.mode, model: draft.model, effort: draft.effort };
  const key = JSON.stringify(target);
  if (key === lastWarm.key && Date.now() - lastWarm.at < 60000) return;
  lastWarm = { key, at: Date.now() };
  api.warm(target).catch(() => {});
}

// Menus read the catalog from cache; fetch it shortly after a view settles, not when a menu opens.
let prefetchTimer = null;
function prefetchCatalog() {
  clearTimeout(prefetchTimer);
  const scope = currentScope();
  prefetchTimer = setTimeout(() => { if (JSON.stringify(scope) === JSON.stringify(currentScope())) getCatalog(scope); }, 800);
}

/** Re-renders everything that depends on the active session (cheap: no thread re-render). */
function refresh() {
  const session = activeSession();
  renderSidebar(els.list, { ...state, filter: els.search.value, onSelect: openFromSidebar, onPin: (id, pinned) => actions.setPinned(id, pinned), onRegroup: refresh });
  // Never rebuild a bar or page the user is typing in (title, folder); it would lose the edit.
  const editing = node => node.contains(document.activeElement) && node.dataset.sessionId === String(session?.id ?? '');
  if (!editing(els.topbar)) renderTopbar(els.topbar, session, {
    onToggleSidebar: toggleSidebar, onRename: name => actions.rename(name), onOpenPanel: id => actions.openPanel(id),
    onFork: () => actions.fork(), onClear: () => actions.clear(), onExport: () => actions.exportChat(),
    onFocus: () => actions.toggleFocus(), onDelete: () => actions.remove(), onPin: () => session && actions.setPinned(session.id, !session.pinned),
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
const eventView = { thread, refresh, selectSession, onTurnFailed: () => modelHealth.afterFailedTurn(), fetchContext: id => api.control({ sessionId: id }, 'get_context_usage', { ifRunning: true })
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
document.addEventListener('keydown', event => {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); composer.insert('/', { replace: !composer.textarea.value }); }
  else if (mod && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); selectSession(null); }
  else if (mod && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleSidebar(); }
  else if (mod && event.key === ',') { event.preventDefault(); actions.openPanel('model'); }
  else if (event.key === 'Escape' && !event.defaultPrevented && activeSession()?.status === 'running'
    && !document.querySelector('.modal-backdrop, .popover, dialog[open]')) actions.stop();
});
els.scroller.addEventListener('scroll', () => els.topbar.classList.toggle('scrolled', els.scroller.scrollTop > 4));
