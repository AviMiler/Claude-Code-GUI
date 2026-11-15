/**
 * The automatic checks running now, one per session, so a stop, an archive, a delete or the server's exit kills it
 * (with its whole process tree). Spawned like the Terminal pane's commands (shell-run.js: UTF-8, tree kill), but
 * keeps the END of the output: a failing test run prints its failures last.
 */
const { spawnShell, killTree } = require('../terminal/shell-run');
const { ANSI_PATTERN } = require('../spawn-utils');

const KEEP_CHARS = 16000; // of the output's end; the hook's reason uses at most 4000
const runs = new Map(); // sessionId -> { stop }

/**
 * Runs a check; never rejects.
 * @param {string} sessionId @param {{command:string, shell:string, cwd:string, env:object, timeoutMs:number}} options
 * @returns {Promise<{passed:boolean, exitCode:number|null, output:string, cut:boolean, stopped:boolean, timedOut:boolean, error:string|null}>}
 */
function runCheck(sessionId, { command, shell, cwd, env, timeoutMs }) {
  return new Promise(resolve => {
    let output = '';
    let cut = false;
    let stopped = false;
    let timedOut = false;
    let child;
    const finish = (exitCode, error = null) => {
      if (runs.get(sessionId)?.child !== child) return;
      runs.delete(sessionId);
      clearTimeout(timer);
      resolve({ passed: exitCode === 0 && !error && !stopped && !timedOut, exitCode, output, cut, stopped, timedOut, error });
    };
    try { child = spawnShell(command, shell, cwd, env); } catch (error) { resolve({ passed: false, exitCode: null, output: '', cut: false, stopped: false, timedOut: false, error: error.message }); return; }
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    runs.set(sessionId, { child, stop: () => { stopped = true; killTree(child); } });
    const take = chunk => {
      output += chunk.replace(ANSI_PATTERN, '').replace(/\r\n/g, '\n');
      if (output.length > KEEP_CHARS) { output = output.slice(-KEEP_CHARS); cut = true; }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', error => finish(null, error.message));
    child.on('close', exitCode => finish(exitCode));
  });
}

const isChecking = sessionId => runs.has(sessionId);

/** @returns {boolean} a check of this session was running (it is killed) */
function stopCheck(sessionId) {
  const run = runs.get(sessionId);
  if (run) run.stop();
  return Boolean(run);
}

function stopAll() { for (const run of runs.values()) run.stop(); }
process.on('exit', stopAll);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stopAll(); process.exit(); });

module.exports = { runCheck, isChecking, stopCheck };
