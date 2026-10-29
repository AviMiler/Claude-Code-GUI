/** One shell command: spawned in a folder, its output streamed in pieces, killed with its whole process tree on request. */
const { spawn, execFile } = require('child_process');
const { shellSpec } = require('./shell-spec');
const { ANSI_PATTERN } = require('../spawn-utils');

const MAX_STREAM_CHARS = 64 * 1024; // kept and sent per stream; the rest is dropped and the run says so

/** @param {object} env @returns {import('child_process').ChildProcess} */
function spawnShell(command, shell, cwd, env) {
  const { file, args } = shellSpec(command, shell);
  // POSIX: its own process group, so the kill below reaches what the command started
  return spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, windowsVerbatimArguments: process.platform === 'win32', detached: process.platform !== 'win32' });
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}

/**
 * Runs a command; never throws.
 * @param {{command:string, shell?:string, cwd:string, env:object}} options
 * @param {{onOut:(stream:'stdout'|'stderr', text:string)=>void, onEnd:(result:object)=>void}} handlers
 * @returns {{stop:()=>void}}
 * onEnd gets {exitCode, signal, stdout, stderr, truncated, stopped, error}
 */
function runShell({ command, shell, cwd, env }, { onOut, onEnd }) {
  const output = { stdout: '', stderr: '' };
  let truncated = false;
  let stopped = false;
  let ended = false;
  const finish = result => { if (!ended) { ended = true; onEnd({ stdout: output.stdout, stderr: output.stderr, truncated, stopped, error: null, ...result }); } };
  let child;
  try { child = spawnShell(command, shell, cwd, env); } catch (error) { finish({ exitCode: null, signal: null, error: error.message }); return { stop() {} }; }
  const take = stream => chunk => {
    const text = chunk.replace(ANSI_PATTERN, '').replace(/\r\n/g, '\n');
    const room = MAX_STREAM_CHARS - output[stream].length;
    if (room <= 0) { truncated = true; return; }
    const piece = text.slice(0, room);
    truncated = truncated || piece.length < text.length;
    output[stream] += piece;
    onOut(stream, piece);
  };
  child.stdout.setEncoding('utf8'); // a decoder keeps a character that is split between two chunks
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', take('stdout'));
  child.stderr.on('data', take('stderr'));
  child.on('error', error => finish({ exitCode: null, signal: null, error: error.message }));
  child.on('close', (exitCode, signal) => finish({ exitCode, signal }));
  return { stop() { stopped = true; killTree(child); } };
}

module.exports = { runShell, MAX_STREAM_CHARS };
