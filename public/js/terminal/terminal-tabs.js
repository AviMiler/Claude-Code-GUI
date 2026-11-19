/**
 * The Terminal pane's terminals per session, as the browser knows them: the list (the server keeps it), which one is
 * shown, and each one's current folder (it moves when a command ends, see shell `end` events).
 */
import { api } from '../api.js';
import { toast } from '../ui.js';
import { forgetTerminal } from './shell-store.js';

/** @typedef {{id:string, n:number, cwd:string, running:boolean}} TerminalTab */

/** @param {{onChange:()=>void}} handlers onChange: the list, the shown tab or a folder changed (draw again) */
export function createTerminalTabs({ onChange }) {
  const bySession = new Map(); // sessionId -> { list: TerminalTab[], active: string|null, state: 'idle'|'loading'|'ready'|'failed', max, loading?: Promise<void>: number }
  const entry = sessionId => {
    if (!bySession.has(sessionId)) bySession.set(sessionId, { list: [], active: null, state: 'idle', max: 8 });
    return bySession.get(sessionId);
  };
  const fail = error => toast(error.message, 'error');

  /** Fetches the session's terminals once (a failure is not retried by itself). @param {boolean} first a session with none gets its first one */
  function load(sessionId, first = true) {
    const own = entry(sessionId);
    if (own.state !== 'idle') return own.loading;
    own.state = 'loading';
    own.loading = (async () => {
      try {
        const found = await api.terminals(sessionId);
        own.list = found.terminals;
        own.max = found.max;
        own.active = own.list[0]?.id || null;
        own.state = 'ready';
        if (first && !own.list.length) await add(sessionId);
      } catch (error) { own.state = 'failed'; fail(error); }
      onChange();
    })();
    return own.loading;
  }

  /** Opens a terminal (in the session's folder, or in `folder`) and shows it. @returns {Promise<TerminalTab|null>} */
  async function add(sessionId, folder) {
    const own = entry(sessionId);
    if (own.state === 'failed') own.state = 'idle';
    if (own.state !== 'ready') await load(sessionId, false);
    if (own.state !== 'ready') return null;
    try {
      const { terminal } = await api.openTerminal(sessionId, folder);
      own.list.push(terminal);
      own.active = terminal.id;
      onChange();
      return terminal;
    } catch (error) { fail(error); return null; }
  }

  async function close(sessionId, terminalId) {
    const own = entry(sessionId);
    const at = own.list.findIndex(tab => tab.id === terminalId);
    if (at < 0) return;
    try { await api.closeTerminal(sessionId, terminalId); } catch (error) { return fail(error); }
    own.list.splice(at, 1);
    forgetTerminal(sessionId, terminalId);
    if (own.active === terminalId) own.active = (own.list[at] || own.list[at - 1])?.id || null;
    onChange();
  }

  return {
    load, add, close,
    max: sessionId => entry(sessionId).max,
    /** @returns {TerminalTab[]} */ list: sessionId => entry(sessionId).list,
    /** @returns {TerminalTab|null} the shown one */ active: sessionId => entry(sessionId).list.find(tab => tab.id === entry(sessionId).active) || null,
    select(sessionId, terminalId) { entry(sessionId).active = terminalId; onChange(); },
    /** Takes a folder / running state the server reported for a terminal. */
    update(sessionId, terminalId, patch) {
      const tab = entry(sessionId).list.find(item => item.id === terminalId);
      if (tab) { Object.assign(tab, patch); onChange(); }
    },
  };
}
