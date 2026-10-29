/** The shell commands running now: one per session, so a stop, an archive or a delete finds it. */
const crypto = require('crypto');
const { broadcast } = require('../event-hub');
const { runShell } = require('./shell-run');

const runs = new Map(); // sessionId -> { runId, stop }

const isRunning = sessionId => runs.has(sessionId);

/**
 * Starts a command and streams it as `shell` events (phase start / out / end).
 * @param {{sessionId:string, command:string, shell?:string, source:'terminal'|'bang', cwd:string, env:object}} options
 * @param {(run:{runId:string, result:object})=>void} onEnd called once with the finished result, after the end event
 * @returns {string} runId
 */
function startRun({ sessionId, command, shell, source, cwd, env }, onEnd) {
  const runId = crypto.randomUUID();
  broadcast({ type: 'shell', sessionId, runId, phase: 'start', command, source });
  const control = runShell({ command, shell, cwd, env }, {
    onOut: (stream, text) => broadcast({ type: 'shell', sessionId, runId, phase: 'out', stream, text }),
    onEnd: result => {
      runs.delete(sessionId);
      const { stdout, stderr, ...rest } = result;
      broadcast({ type: 'shell', sessionId, runId, phase: 'end', ...rest });
      onEnd({ runId, result });
    },
  });
  runs.set(sessionId, { runId, stop: control.stop });
  return runId;
}

/** @returns {boolean} a command of this session (and this run, when given) was running */
function stopRun(sessionId, runId) {
  const run = runs.get(sessionId);
  if (!run || (runId && run.runId !== runId)) return false;
  run.stop();
  return true;
}

function stopAll() { for (const run of runs.values()) run.stop(); }
process.on('exit', stopAll);
// A command has its own process group, so Ctrl+C or a stop of the server does not reach it; 'exit' does not fire on signals.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stopAll(); process.exit(); });

module.exports = { isRunning, startRun, stopRun };
