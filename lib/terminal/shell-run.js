/** One shell command: spawned in a folder, its output streamed in pieces, killed with its whole process tree on request. */
const { spawn, execFile, execFileSync } = require('child_process');
const { shellSpec } = require('./shell-spec');
const { ANSI_PATTERN } = require('../spawn-utils');
const { makeMarker, createFilter } = require('./shell-sentinel');

const MAX_OUTPUT_CHARS = 128 * 1024; // kept and sent per command (both streams together); the rest is dropped and the run says so
const MAX_STREAM_CHARS = MAX_OUTPUT_CHARS;
const CLOSE_GRACE_MS = 3000; // after a stop, a program that still holds the pipes open does not keep the run alive

/** @param {object} env @param {string} [marker] see shell-sentinel.js @returns {import('child_process').ChildProcess} */
function spawnShell(command, shell, cwd, env, marker) {
  const { file, args } = shellSpec(command, shell, marker);
  // POSIX: its own process group, so the kill below reaches what the command started
  return spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, windowsVerbatimArguments: process.platform === 'win32', detached: process.platform !== 'win32' });
}

/** Kills the command and everything it started (taskkill /T /F with an argument array). `sync`: wait for it (server exit). */
function killTree(child, sync = false) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const args = ['/pid', String(child.pid), '/T', '/F'];
    if (!sync) return execFile('taskkill', args, { windowsHide: true }, () => {});
    try { execFileSync('taskkill', args, { windowsHide: true, stdio: 'ignore', timeout: 3000 }); } catch { /* already gone */ }
  } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}

/**
 * Runs a command; never throws.
 * @param {{command:string, shell?:string, cwd:string, env:object, trackCwd?:boolean}} options trackCwd: also learn the
 *   folder the shell ended in (onEnd's `cwd`, null when it did not say, for example after `exit`)
 * @param {{onOut:(stream:'stdout'|'stderr', text:string)=>void, onEnd:(result:object)=>void}} handlers
 * @returns {{stop:(sync?:boolean)=>void}}
 * onEnd gets {exitCode, signal, stdout, stderr, truncated, stopped, error, cwd}
 */
function runShell({ command, shell, cwd, env, trackCwd }, { onOut, onEnd }) {
  const output = { stdout: '', stderr: '' };
  let truncated = false;
  let stopped = false;
  let ended = false;
  let sentinel = null;
  const marker = trackCwd ? makeMarker() : undefined;
  const filter = marker ? createFilter(marker) : null;
  const finish = result => {
    if (ended) return;
    ended = true;
    if (filter) { const done = filter.finish(); if (done.rest) take('stdout', done.rest); sentinel = done.sentinel; }
    // the sentinel's code is the command's own; a stopped or exited shell never printed one
    const exitCode = sentinel && !stopped ? sentinel.exitCode : result.exitCode;
    onEnd({ stdout: output.stdout, stderr: output.stderr, truncated, stopped, error: null, ...result, exitCode, cwd: stopped ? null : sentinel?.cwd ?? null });
  };
  let child;
  try { child = spawnShell(command, shell, cwd, env, marker); } catch (error) { finish({ exitCode: null, signal: null, error: error.message }); return { stop() {} }; }
  function take(stream, raw) {
    const text = raw.replace(ANSI_PATTERN, '').replace(/\r\n/g, '\n');
    const room = MAX_OUTPUT_CHARS - output.stdout.length - output.stderr.length;
    if (room <= 0) { if (text) truncated = true; return; }
    const piece = text.slice(0, room);
    truncated = truncated || piece.length < text.length;
    output[stream] += piece;
    if (piece) onOut(stream, piece);
  }
  child.stdout.setEncoding('utf8'); // a decoder keeps a character that is split between two chunks
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => take('stdout', filter ? filter.push(chunk) : chunk));
  child.stderr.on('data', chunk => take('stderr', chunk));
  child.on('error', error => finish({ exitCode: null, signal: null, error: error.message }));
  child.on('close', (exitCode, signal) => finish({ exitCode, signal }));
  return {
    stop(sync = false) {
      stopped = true;
      killTree(child, sync);
      setTimeout(() => finish({ exitCode: null, signal: 'SIGKILL' }), CLOSE_GRACE_MS).unref();
    },
  };
}

module.exports = { runShell, spawnShell, killTree, MAX_STREAM_CHARS, MAX_OUTPUT_CHARS };
