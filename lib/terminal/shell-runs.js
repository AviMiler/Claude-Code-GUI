/** The shell commands running now: one per terminal (and one `!` command) of a session, so a stop, an archive or a delete finds them. */
const crypto = require('crypto');
const { broadcast } = require('../event-hub');
const { runShell } = require('./shell-run');

const BANG = 'bang'; // the key of a `!` command; a terminal's key is its id
const runs = new Map(); // sessionId -> Map(key -> { runId, stop })

const isRunning = (sessionId, key = BANG) => Boolean(runs.get(sessionId)?.has(key));

/**
 * Starts a command and streams it as `shell` events (phase start / out / end).
 * @param {{sessionId:string, terminalId?:string, command:string, shell?:string, source:'terminal'|'bang', cwd:string, env:object}} options
 *   terminalId: the terminal that runs it (its folder is tracked: the end event and the result carry `cwd`)
 * @param {(run:{runId:string, result:object})=>void} onEnd called once with the finished result, after the end event
 * @returns {string} runId
 */
function startRun({ sessionId, terminalId, command, shell, source, cwd, env }, onEnd) {
  const runId = crypto.randomUUID();
  const key = terminalId || BANG;
  broadcast({ type: 'shell', sessionId, terminalId, runId, phase: 'start', command, source, cwd });
  const control = runShell({ command, shell, cwd, env, trackCwd: Boolean(terminalId) }, {
    onOut: (stream, text) => broadcast({ type: 'shell', sessionId, terminalId, runId, phase: 'out', stream, text }),
    onEnd: result => {
      const own = runs.get(sessionId);
      own?.delete(key);
      if (own && !own.size) runs.delete(sessionId);
      onEnd({ runId, result }); // first: the terminal's folder is updated before the end event reaches the browser
      const { stdout, stderr, ...rest } = result;
      broadcast({ type: 'shell', sessionId, terminalId, runId, phase: 'end', ...rest });
    },
  });
  if (!runs.has(sessionId)) runs.set(sessionId, new Map());
  runs.get(sessionId).set(key, { runId, stop: control.stop });
  return runId;
}

/**
 * @param {string} sessionId @param {string} [key] a terminal id (or 'bang'); without it every command of the session stops
 * @param {boolean} [sync] wait for the process kill (server exit)
 * @returns {boolean} something was running
 */
function stopRun(sessionId, key, sync = false) {
  const own = runs.get(sessionId);
  const wanted = key ? [own?.get(key)] : [...(own?.values() || [])];
  const found = wanted.filter(Boolean);
  found.forEach(run => run.stop(sync));
  return found.length > 0;
}

function stopAll() { for (const sessionId of [...runs.keys()]) stopRun(sessionId, undefined, true); }
process.on('exit', stopAll);
// A command has its own process group, so Ctrl+C or a stop of the server does not reach it; 'exit' does not fire on signals.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stopAll(); process.exit(); });

module.exports = { BANG, isRunning, startRun, stopRun };
