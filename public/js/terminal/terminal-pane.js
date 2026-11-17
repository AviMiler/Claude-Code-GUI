/**
 * Terminal pane (Claude Code Desktop's terminal): tabs, each a command line with its own folder, and the commands run
 * in it so far. Each command is a separate process (the folder carries over, nothing else; no interactive programs);
 * the commands here are not told to Claude, only `!` commands in the composer are.
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { toast } from '../ui.js';
import { shellBlock } from './shell-block.js';
import { terminalRuns, terminalBusy, clearTerminal, onShellRun } from './shell-store.js';
import { shellChoice } from './shell-choice.js';
import { createTerminalTabs } from './terminal-tabs.js';
import { tabStrip } from './tab-strip.js';
import { registerTerminalOpener } from './open-in-terminal.js';

const HISTORY_KEY = 'claude-gui.terminal-history';
const MAX_HISTORY = 50;

function recallHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

/**
 * @param {{rerender:()=>void, openPane:(id:string)=>void}} deps rerender: draws the panes again; openPane: shows this pane
 * @returns {import('../panes/pane-host.js').PaneDefinition}
 */
export function createTerminalPane({ rerender, openPane }) {
  let body = null;
  let session = null;
  let strip = null; // holds the tab strip
  let log = null;
  let input = null;
  let drawn = null; // `${sessionId}|${terminalId}` whose log is on screen
  const blocks = new Map(); // runId -> its block
  const history = recallHistory();
  let cursor = history.length;
  const choice = shellChoice();
  const tabs = createTerminalTabs({ onChange: () => rerender() });

  const keepEnd = () => { log.scrollTop = log.scrollHeight; };
  const empty = () => h('p', { class: 'detail-muted shell-empty' }, 'הפקודות רצות בתיקיית הטרמינל, כל אחת בנפרד. cd נשמר בין פקודות, משתני סביבה לא. אין תוכניות אינטראקטיביות.');
  const stop = run => api.stopShell(run.sessionId, run.terminalId).catch(error => toast(error.message, 'error'));

  function addBlock(run) {
    const block = shellBlock(run, { onStop: () => stop(run) });
    blocks.set(run.runId, block);
    log.querySelector('.shell-empty')?.remove();
    log.append(block);
    keepEnd();
  }

  function drawLog(tab) {
    blocks.clear();
    log.replaceChildren();
    const runs = tab ? terminalRuns(session.id, tab.id) : [];
    if (!runs.length) log.append(empty());
    runs.forEach(addBlock);
    input.disabled = !tab;
  }

  async function run() {
    const tab = tabs.active(session.id);
    const command = input.value.trim();
    if (!command || !tab) return;
    if (terminalBusy(session.id, tab.id)) return toast('פקודה אחרת עדיין רצה בטרמינל הזה. חכה שתסתיים או עצור אותה.');
    input.value = '';
    history.push(command);
    history.splice(0, Math.max(0, history.length - MAX_HISTORY));
    cursor = history.length;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* storage may be blocked */ }
    try { await api.runShell(session.id, command, 'terminal', choice.get(), tab.id); } catch (error) { input.value = command; toast(error.message, 'error'); }
  }

  function walkHistory(step) {
    cursor = Math.min(history.length, Math.max(0, cursor + step));
    input.value = history[cursor] || '';
  }

  /** A command of some terminal started or ended: its tab shows it, and an end brings the folder the shell stopped in. */
  function onRun(runItem, phase) {
    if (runItem.source !== 'terminal' || !session || runItem.sessionId !== session.id) return;
    if (phase === 'start') tabs.update(session.id, runItem.terminalId, { running: true });
    if (phase === 'end') {
      tabs.update(session.id, runItem.terminalId, { running: false, ...(runItem.cwd && { cwd: runItem.cwd }) });
      if (runItem.cwdRefused) toast('התיקייה שהפקודה הגיעה אליה מחוץ לתיקיות הסשן. הטרמינל נשאר בתיקייה הקודמת.');
    }
    if (runItem.terminalId !== tabs.active(session.id)?.id) return;
    if (phase === 'start') addBlock(runItem);
    else blocks.get(runItem.runId)?.update(runItem);
    if (phase === 'end') input.focus({ preventScroll: true });
    keepEnd();
  }

  function build() {
    strip = h('div', { class: 'shell-strip' });
    log = h('div', { class: 'shell-log', tabIndex: 0 });
    input = h('input', { class: 'shell-input', dir: 'ltr', spellcheck: false, autocomplete: 'off', 'aria-label': 'פקודה', placeholder: 'כתוב פקודה ולחץ Enter' });
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); run(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); walkHistory(-1); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); walkHistory(1); }
    });
    const clear = h('button', { type: 'button', class: 'btn small', title: 'ניקוי החלונית', onClick: () => { const tab = tabs.active(session.id); if (tab) clearTerminal(session.id, tab.id); drawn = null; rerender(); } }, 'ניקוי');
    body.replaceChildren(h('div', { class: 'shell-pane' }, strip, log, h('div', { class: 'shell-bar' }, h('span', { class: 'shell-prompt', 'aria-hidden': 'true' }, '$'), input, choice.node, clear)));
    onShellRun(onRun);
  }

  registerTerminalOpener(async (sessionId, folder) => {
    await tabs.add(sessionId, folder); // first, so a session that was never loaded does not get its default terminal too
    openPane('terminal');
  });

  return {
    id: 'terminal', title: 'טרמינל', icon: 'terminal',
    render(element, current) {
      session = current;
      if (body !== element) { body = element; drawn = null; build(); }
      tabs.load(current.id);
      const view = { list: tabs.list(current.id), active: tabs.active(current.id)?.id || null, max: tabs.max(current.id) };
      strip.replaceChildren(tabStrip(view, {
        onSelect: id => tabs.select(current.id, id),
        onClose: id => tabs.close(current.id, id),
        onAdd: () => tabs.add(current.id),
      }));
      const key = `${current.id}|${view.active}`;
      if (drawn === key) return;
      drawn = key;
      drawLog(tabs.active(current.id));
    },
  };
}
