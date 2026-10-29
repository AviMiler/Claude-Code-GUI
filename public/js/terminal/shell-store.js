/**
 * The shell commands the browser has seen, from the server's `shell` events (lib/terminal/shell-runs.js): the Terminal
 * pane's history per session (browser memory only) and the live state of a `!` command until its card is saved.
 */
const MAX_RUNS = 50; // per session, in the pane

/** @typedef {{runId:string, sessionId:string, command:string, source:'terminal'|'bang', stdout:string, stderr:string,
 *   running:boolean, exitCode?:number|null, stopped?:boolean, truncated?:boolean, error?:string|null}} ShellRun */

const bySession = new Map(); // sessionId -> ShellRun[] (oldest first)
const listeners = new Set();

/** @param {(run:ShellRun, phase:'start'|'out'|'end')=>void} listener @returns {()=>void} unsubscribe */
export function onShellRun(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {string} sessionId @returns {ShellRun[]} the pane's commands (not the `!` ones) */
export const terminalRuns = sessionId => (bySession.get(sessionId) || []).filter(run => run.source === 'terminal');

export function clearTerminal(sessionId) {
  bySession.set(sessionId, (bySession.get(sessionId) || []).filter(run => run.source !== 'terminal' || run.running));
}

/** Applies one `shell` event from the server. */
export function applyShellEvent(event) {
  const runs = bySession.get(event.sessionId) || [];
  bySession.set(event.sessionId, runs);
  if (event.phase === 'start') {
    const run = { runId: event.runId, sessionId: event.sessionId, command: event.command, source: event.source, stdout: '', stderr: '', running: true };
    runs.push(run);
    if (runs.length > MAX_RUNS) runs.shift();
    listeners.forEach(listener => listener(run, 'start'));
    return;
  }
  const run = runs.find(item => item.runId === event.runId);
  if (!run) return; // a command that started before this page was opened
  if (event.phase === 'out') run[event.stream] += event.text;
  else Object.assign(run, { running: false, exitCode: event.exitCode, stopped: event.stopped, truncated: event.truncated, error: event.error });
  listeners.forEach(listener => listener(run, event.phase));
  if (event.phase === 'end' && run.source === 'bang') runs.splice(runs.indexOf(run), 1); // its saved card takes over
}

export function forgetShellSession(sessionId) { bySession.delete(sessionId); }
