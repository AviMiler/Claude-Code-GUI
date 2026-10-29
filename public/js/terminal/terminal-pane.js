/**
 * Terminal pane (Claude Code Desktop's terminal): a command line in the session's folder and the commands run so far.
 * Each command is a separate process (no state carries over, no interactive programs); the commands here are not
 * told to Claude, only `!` commands in the composer are.
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { toast } from '../ui.js';
import { shellBlock } from './shell-block.js';
import { terminalRuns, clearTerminal, onShellRun } from './shell-store.js';
import { shellChoice } from './shell-choice.js';

const HISTORY_KEY = 'claude-gui.terminal-history';
const MAX_HISTORY = 50;

function recallHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

/** @returns {import('../panes/pane-host.js').PaneDefinition} */
export function createTerminalPane() {
  let body = null;
  let shownSession = null;
  let session = null;
  let log = null;
  let input = null;
  let busy = false; // a command of this session is running (one at a time)
  const blocks = new Map(); // runId -> its block
  const history = recallHistory();
  let cursor = history.length;
  const choice = shellChoice();

  const keepEnd = () => { log.scrollTop = log.scrollHeight; };
  const empty = () => h('p', { class: 'detail-muted shell-empty' }, 'הפקודות רצות בתיקיית הסשן, כל אחת בנפרד: cd ומשתני סביבה לא נשמרים בין פקודות. אין תוכניות אינטראקטיביות.');

  function addBlock(run) {
    const block = shellBlock(run, { onStop: () => api.stopShell(run.sessionId).catch(error => toast(error.message, 'error')) });
    blocks.set(run.runId, block);
    log.querySelector('.shell-empty')?.remove();
    log.append(block);
    keepEnd();
  }

  function drawLog() {
    blocks.clear();
    log.replaceChildren();
    const runs = terminalRuns(session.id);
    if (!runs.length) log.append(empty());
    runs.forEach(addBlock);
    busy = runs.some(run => run.running);
    input.disabled = false;
  }

  async function run() {
    const command = input.value.trim();
    if (!command) return;
    if (busy) return toast('פקודה אחרת עדיין רצה. חכה שתסתיים או עצור אותה.');
    input.value = '';
    history.push(command);
    history.splice(0, Math.max(0, history.length - MAX_HISTORY));
    cursor = history.length;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* storage may be blocked */ }
    try { await api.runShell(session.id, command, 'terminal', choice.get()); } catch (error) { input.value = command; toast(error.message, 'error'); }
  }

  function walkHistory(step) {
    cursor = Math.min(history.length, Math.max(0, cursor + step));
    input.value = history[cursor] || '';
  }

  function build() {
    log = h('div', { class: 'shell-log', tabIndex: 0 });
    input = h('input', { class: 'shell-input', dir: 'ltr', spellcheck: false, autocomplete: 'off', 'aria-label': 'פקודה', placeholder: 'כתוב פקודה ולחץ Enter' });
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); run(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); walkHistory(-1); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); walkHistory(1); }
    });
    const clear = h('button', { type: 'button', class: 'btn small', title: 'ניקוי החלונית', onClick: () => { clearTerminal(session.id); drawLog(); } }, 'ניקוי');
    body.replaceChildren(h('div', { class: 'shell-pane' }, log, h('div', { class: 'shell-bar' }, h('span', { class: 'shell-prompt', 'aria-hidden': 'true' }, '$'), input, choice.node, clear)));
    onShellRun((runItem, phase) => {
      if (runItem.source !== 'terminal' || !session || runItem.sessionId !== session.id) return;
      if (phase === 'start') { busy = true; addBlock(runItem); return; }
      blocks.get(runItem.runId)?.update(runItem);
      if (phase === 'end') { busy = false; input.focus({ preventScroll: true }); }
      keepEnd();
    });
  }

  return {
    id: 'terminal', title: 'טרמינל', icon: 'terminal',
    render(element, current) {
      session = current;
      if (body !== element) { body = element; shownSession = null; build(); }
      if (shownSession === current.id) return;
      shownSession = current.id;
      drawLog();
    },
  };
}
