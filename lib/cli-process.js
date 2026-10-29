/**
 * One long-lived `claude -p --input-format stream-json` process and its control protocol.
 * Why persistent (not one process per message): permission prompts, interrupt, live model/mode switches
 * and catalog queries (commands, skills, MCP, context) all need an open stdin.
 */
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const { commandFor } = require('./spawn-utils');

const STDERR_TAIL_CHARS = 3000;
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * @param {object} config {claudePath, env}
 * @param {string[]} args From cli-args.buildArgs.
 * @param {string} cwd
 * @param {{onMessage:(event:object)=>void, onControlRequest:(id:string, request:object)=>void,
 *   onControlCancel:(id:string)=>void, onExit:(info:{code:number|null, stderr:string, spawnError:Error|null, killed:boolean})=>void}} handlers
 * @returns {{send:Function, request:Function, respond:Function, respondError:Function, close:Function, kill:Function, isAlive:()=>boolean, pid:number}}
 * @example const proc = startProcess(config, buildArgs(...), cwd, handlers); await proc.request('initialize');
 */
function startProcess(config, args, cwd, handlers) {
  const spec = commandFor(config, args);
  const child = spawn(spec.command, spec.args, { ...spec.options, cwd });
  const pending = new Map(); // request_id -> { resolve, reject, timer }
  let alive = true;
  let killed = false;
  let stdoutBuffer = '';
  let stderr = '';
  let spawnError = null;
  const addDiagnostic = text => { stderr = `${stderr}${text}\n`.slice(-STDERR_TAIL_CHARS); };

  const write = message => {
    if (!alive || !child.stdin.writable) return false;
    child.stdin.write(`${JSON.stringify(message)}\n`, 'utf8');
    return true;
  };

  function handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      console.error('[cli-process] non-JSON output:', trimmed.slice(0, 200));
      return addDiagnostic(trimmed); // usually a plain-text CLI error
    }
    if (event.type === 'control_response') return settle(event.response || {});
    if (event.type === 'control_request') return handlers.onControlRequest(event.request_id, event.request || {});
    if (event.type === 'control_cancel_request') return handlers.onControlCancel(event.request_id);
    if (event.type === 'keep_alive') return;
    handlers.onMessage(event);
  }

  function settle(response) {
    const waiter = pending.get(response.request_id);
    if (!waiter) return;
    pending.delete(response.request_id);
    clearTimeout(waiter.timer);
    if (response.subtype === 'error') waiter.reject(new Error(response.error || 'control request failed'));
    else waiter.resolve(response.response ?? {});
  }

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    const lines = (stdoutBuffer + chunk).split('\n');
    stdoutBuffer = lines.pop();
    lines.forEach(handleLine);
  });
  child.stderr.on('data', chunk => addDiagnostic(chunk.trimEnd()));
  child.stdin.on('error', error => console.error('[cli-process] stdin error:', error.message));
  // A failed spawn (wrong path) may never emit 'close', so it finishes here.
  child.on('error', error => { spawnError = error; if (!child.pid) setImmediate(() => finish(null)); });
  child.on('close', code => finish(code));

  function finish(code) {
    if (!alive) return;
    alive = false;
    handleLine(stdoutBuffer);
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Claude process exited'));
    }
    pending.clear();
    handlers.onExit({ code, stderr: stderr.trim(), spawnError, killed });
  }

  return {
    pid: child.pid,
    isAlive: () => alive,
    /**
     * Sends a user message: a new turn, or while one runs a correction the CLI queues into it (with a uuid, which its
     * replay carries back; runtime-corrections.js). Content may be a string or an array of content blocks.
     */
    send: (content, { uuid } = {}) => write({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: '', ...(uuid && { uuid }) }),
    /** Sends a control request and resolves with its response payload. */
    request(subtype, payload = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
      const requestId = `gui-${crypto.randomUUID()}`;
      return new Promise((resolve, reject) => {
        if (!write({ type: 'control_request', request_id: requestId, request: { subtype, ...payload } })) {
          return reject(new Error('Claude process is not running'));
        }
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`${subtype}: no answer from Claude within ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
        pending.set(requestId, { resolve, reject, timer });
      });
    },
    respond: (requestId, response) => write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } }),
    respondError: (requestId, error) => write({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error } }),
    /** Graceful: closing stdin lets the CLI finish and exit by itself. */
    close: () => { if (alive) child.stdin.end(); },
    kill() {
      if (!alive) return;
      killed = true;
      if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], error => {
          if (error) console.error('[cli-process] taskkill failed:', error.message);
        });
      } else {
        child.kill('SIGTERM');
      }
    },
  };
}

module.exports = { startProcess };
