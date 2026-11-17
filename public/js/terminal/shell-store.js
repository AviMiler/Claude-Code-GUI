/**
 * The shell commands the browser has seen, from the server's `shell` events (lib/terminal/shell-runs.js): each pane
 * terminal's scrollback (browser memory only, capped) and the live state of a `!` command until its card is saved.
 */
const MAX_RUNS = 50; // per terminal
const MAX_CHARS = 400000; // output kept per terminal: the oldest finished commands go first

/** @typedef {{runId:string, sessionId:string, terminalId?:string, cwd?:string, command:string, source:'terminal'|'bang', stdout:string, stderr:string,
 *   running:boolean, cwdRefused?:boolean, exitCode?:number|null, stopped?:boolean, truncated?:boolean, error?:string|null}} ShellRun */

const bySession = new Map(); // sessionId -> ShellRun[] (oldest first)
const listeners = new Set();
const sizeOf = run => run.stdout.length + run.stderr.length;

/** @param {(run:ShellRun, phase:'start'|'out'|'end')=>void} listener @returns {()=>void} unsubscribe */
export function onShellRun(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {string} sessionId @param {string} terminalId @returns {ShellRun[]} that terminal's commands */
export const terminalRuns = (sessionId, terminalId) => (bySession.get(sessionId) || []).filter(run => run.source === 'terminal' && run.terminalId === terminalId);

/** Is a command of this terminal running. */
export const terminalBusy = (sessionId, terminalId) => terminalRuns(sessionId, terminalId).some(run => run.running);

/** Drops a closed terminal's commands. */
export function forgetTerminal(sessionId, terminalId) {
  bySession.set(sessionId, (bySession.get(sessionId) || []).filter(run => run.terminalId !== terminalId));
}

export function clearTerminal(sessionId, terminalId) {
  bySession.set(sessionId, (bySession.get(sessionId) || []).filter(run => run.terminalId !== terminalId || run.running));
}

/** Keeps one terminal's scrollback within its caps (the newest command always stays). */
function trim(runs, terminalId) {
  if (!terminalId) return;
  const own = runs.filter(run => run.terminalId === terminalId);
  let chars = own.reduce((sum, run) => sum + sizeOf(run), 0);
  while (own.length > 1 && (own.length > MAX_RUNS || chars > MAX_CHARS)) {
    const old = own.find(run => !run.running);
    if (!old || old === own[own.length - 1]) break;
    own.splice(own.indexOf(old), 1);
    runs.splice(runs.indexOf(old), 1);
    chars -= sizeOf(old);
  }
}

/** Applies one `shell` event from the server. */
export function applyShellEvent(event) {
  const runs = bySession.get(event.sessionId) || [];
  bySession.set(event.sessionId, runs);
  if (event.phase === 'start') {
    const run = { runId: event.runId, sessionId: event.sessionId, terminalId: event.terminalId, cwd: event.cwd, command: event.command, source: event.source, stdout: '', stderr: '', running: true };
    runs.push(run);
    trim(runs, event.terminalId);
    listeners.forEach(listener => listener(run, 'start'));
    return;
  }
  const run = runs.find(item => item.runId === event.runId);
  if (!run) return; // a command that started before this page was opened
  if (event.phase === 'out') { run[event.stream] += event.text; trim(runs, run.terminalId); }
  else Object.assign(run, { cwd: event.cwd ?? run.cwd, running: false, exitCode: event.exitCode, stopped: event.stopped, truncated: event.truncated, error: event.error, cwdRefused: event.cwdRefused });
  listeners.forEach(listener => listener(run, event.phase));
  if (event.phase === 'end' && run.source === 'bang') runs.splice(runs.indexOf(run), 1); // its saved card takes over
}

export function forgetShellSession(sessionId) { bySession.delete(sessionId); }
