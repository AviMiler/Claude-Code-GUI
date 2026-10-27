/**
 * One live CLI process per session: spawned on demand, kept warm while used, closed when idle.
 * Routes CLI output to the hooks given by session-service (which owns storage and broadcasting).
 */
const crypto = require('crypto');
const { startProcess } = require('./cli-process');
const { buildArgs } = require('./cli-args');
const { getCapabilities } = require('./cli-capabilities');
const { translateEvent, translateDelta, readInit, readTaskEvent } = require('./event-translator');

const INTERRUPT_GRACE_MS = 6000;
const SPARE_IDLE_MS = 3 * 60000;
const runtimes = new Map(); // app session id -> runtime
const starting = new Map(); // app session id -> Promise<runtime> while a start is in progress
let hooks = null;
let spare = null; // { key, runtime }: a process started for the next new session (see prewarmNew)

/** @param {{onItem, onDelta, onInit, onSessionId, onTurnEnd, onPermission, onPermissionResolved, onModeChange, onTask, onExit}} sessionHooks */
function init(sessionHooks) { hooks = sessionHooks; }

const live = id => {
  const runtime = runtimes.get(id);
  return runtime && runtime.proc.isAlive() && !runtime.closing ? runtime : null;
};

/** Closes stdin so the CLI exits by itself; a retiring process is never reused. */
function retire(runtime) {
  runtime.closing = true;
  clearTimeout(runtime.idleTimer);
  runtime.proc.close();
}

function scheduleIdle(runtime) {
  clearTimeout(runtime.idleTimer);
  // A background task (a long build, a Monitor) lives in this process; closing it would kill the task.
  if (runtime.turnActive || runtime.pending.size || runtime.runningTasks.size) return;
  runtime.idleTimer = setTimeout(() => retire(runtime), runtime.idleMs);
}

function handleMessage(runtime, event) {
  if (event.session_id) hooks.onSessionId(runtime.sessionId, event.session_id);
  const info = readInit(event);
  if (info) { runtime.info = info; hooks.onInit(runtime.sessionId, info); }
  const delta = translateDelta(event);
  if (delta) return hooks.onDelta(runtime.sessionId, delta);
  const task = readTaskEvent(event);
  if (task) {
    if (task.phase === 'ended') runtime.runningTasks.delete(task.id); else if (task.phase === 'started') runtime.runningTasks.add(task.id);
    hooks.onTask(runtime.sessionId, task);
    if (task.phase === 'ended') scheduleIdle(runtime);
  }
  if (event.type === 'system' && event.subtype === 'status' && event.permissionMode) {
    hooks.onModeChange(runtime.sessionId, event.permissionMode);
  }
  translateEvent(event).forEach(item => hooks.onItem(runtime.sessionId, item));
  if (event.type === 'result') {
    runtime.turnActive = false;
    clearTimeout(runtime.interruptTimer);
    hooks.onTurnEnd(runtime.sessionId);
    scheduleIdle(runtime);
  }
}

function handleControlRequest(runtime, requestId, request) {
  if (request.subtype !== 'can_use_tool') {
    return runtime.proc.respondError(requestId, `${request.subtype} is not supported by the GUI`);
  }
  const prompt = {
    requestId, toolName: request.tool_name, displayName: request.display_name || request.tool_name,
    title: request.title || null, description: request.description || null, input: request.input || {},
    suggestions: request.permission_suggestions || [], toolUseId: request.tool_use_id || null,
    reason: request.decision_reason || null, blockedPath: request.blocked_path || null, createdAt: Date.now(),
  };
  runtime.pending.set(requestId, prompt);
  clearTimeout(runtime.idleTimer);
  hooks.onPermission(runtime.sessionId, prompt);
}

function resolvePermission(runtime, requestId) {
  if (!runtime.pending.delete(requestId)) return;
  hooks.onPermissionResolved(runtime.sessionId, requestId);
}

function handleExit(runtime, info) {
  if (spare?.runtime === runtime) spare = null;
  clearTimeout(runtime.idleTimer);
  clearTimeout(runtime.interruptTimer);
  if (runtimes.get(runtime.sessionId) === runtime) runtimes.delete(runtime.sessionId);
  [...runtime.pending.keys()].forEach(id => resolvePermission(runtime, id));
  runtime.markExited();
  hooks.onExit(runtime.sessionId, { ...info, duringTurn: runtime.turnActive });
}

/** Returns the live runtime, (re)starting the process when needed. Concurrent callers share one start. */
function ensure(session, config) {
  if (!starting.has(session.id)) {
    starting.set(session.id, startIfNeeded(session, config).finally(() => starting.delete(session.id)));
  }
  return starting.get(session.id);
}

async function startIfNeeded(session, config) {
  const current = runtimes.get(session.id);
  const reusable = current && live(session.id) && !(current.needsRestart && !current.turnActive && !current.pending.size);
  if (reusable) return current;
  if (current) { retire(current); await current.exited; }
  const capabilities = await getCapabilities(config);
  const runtime = {
    sessionId: session.id, pending: new Map(), runningTasks: new Set(), turnActive: false, needsRestart: false, closing: false,
    idleTimer: null, interruptTimer: null, info: null, idleMs: (config.idleMinutes || 20) * 60000,
  };
  runtime.exited = new Promise(resolve => { runtime.markExited = resolve; });
  runtime.proc = startProcess(config, buildArgs(session, config, capabilities), session.cwd, {
    onMessage: event => handleMessage(runtime, event),
    onControlRequest: (id, request) => handleControlRequest(runtime, id, request),
    onControlCancel: id => resolvePermission(runtime, id),
    onExit: info => handleExit(runtime, info),
  });
  runtimes.set(session.id, runtime);
  runtime.initialize = runtime.proc.request('initialize', {}, 60000).catch(error => {
    console.error('[session-runtime] initialize failed:', error.message);
    return null;
  });
  scheduleIdle(runtime);
  return runtime;
}

/** Starts a turn. @param {string|object[]} content */
async function sendMessage(session, content, config) {
  const runtime = await ensure(session, config);
  if (!runtime.proc.send(content)) throw new Error('Claude process is not running');
  runtime.turnActive = true;
  clearTimeout(runtime.idleTimer);
}

/** Interrupts the running turn; kills the process if it does not stop in time. */
async function interrupt(sessionId) {
  const runtime = live(sessionId);
  if (!runtime || !runtime.turnActive) return false;
  for (const requestId of [...runtime.pending.keys()]) {
    runtime.proc.respond(requestId, { behavior: 'deny', message: 'Interrupted by the user', interrupt: true });
    resolvePermission(runtime, requestId);
  }
  runtime.interruptTimer = setTimeout(() => runtime.turnActive && runtime.proc.kill(), INTERRUPT_GRACE_MS);
  await runtime.proc.request('interrupt', {}, INTERRUPT_GRACE_MS).catch(() => runtime.proc.kill());
  return true;
}

/**
 * Answers a pending permission prompt.
 * @param {{behavior:'allow'|'deny', alwaysAllow?:boolean, setMode?:string, updatedInput?:object, message?:string}} answer
 * @returns {object|null} the prompt that was answered
 */
function answerPermission(sessionId, requestId, answer) {
  const runtime = live(sessionId);
  const prompt = runtime?.pending.get(requestId);
  if (!prompt) return null;
  if (answer.behavior === 'allow') {
    const updatedPermissions = answer.alwaysAllow ? [...prompt.suggestions] : [];
    if (answer.setMode) updatedPermissions.push({ type: 'setMode', mode: answer.setMode, destination: 'session' });
    runtime.proc.respond(requestId, {
      behavior: 'allow', updatedInput: answer.updatedInput || prompt.input,
      ...(updatedPermissions.length && { updatedPermissions }),
    });
  } else {
    runtime.proc.respond(requestId, { behavior: 'deny', message: answer.message || 'The user denied this request.' });
  }
  resolvePermission(runtime, requestId);
  scheduleIdle(runtime);
  return prompt;
}

/** Sends a control request, starting the process when needed. */
async function control(session, config, subtype, payload = {}, timeoutMs) {
  const runtime = await ensure(session, config);
  try {
    return await runtime.proc.request(subtype, payload, timeoutMs);
  } finally {
    scheduleIdle(runtime);
  }
}

/** Applies changed session settings: live where the protocol allows it, otherwise by a restart when idle. */
async function applySettings(session, patch, config) {
  const runtime = live(session.id);
  if (!runtime) return;
  const restartLater = () => { runtime.needsRestart = true; };
  if ('mode' in patch) await runtime.proc.request('set_permission_mode', { mode: patch.mode }).catch(restartLater);
  if ('model' in patch) {
    await runtime.proc.request('set_model', { model: session.model || config.model || 'default' }).catch(restartLater);
  }
  if (['effort', 'agent', 'addDirs', 'outputStyle'].some(key => key in patch)) restartLater();
  if (runtime.needsRestart && !runtime.turnActive && !runtime.pending.size) retire(runtime);
}

/** Starts the session's process ahead of its next message (the user is typing), so the turn starts at once. */
function prewarm(session, config) {
  return live(session.id) ? Promise.resolve(runtimes.get(session.id)) : ensure(session, config);
}

/** What must match between a warmed spare and the session created later, for the spare to be used. */
const spareKey = settings => JSON.stringify([settings.cwd, settings.mode, settings.model || '', settings.effort || '']);

/**
 * Starts a process for a session that does not exist yet (typing on the welcome page). Why: starting the CLI takes
 * seconds; this way the first message of a new session does not wait for it. One spare at most, closed after a few idle minutes.
 * @param {{cwd:string, mode:string, model?:string, effort?:string}} settings
 */
async function prewarmNew(settings, config) {
  const key = spareKey(settings);
  if (spare && spare.key === key && live(spare.runtime.sessionId)) return;
  if (spare) retire(spare.runtime);
  const runtime = await ensure({ id: `spare-${crypto.randomUUID()}`, addDirs: [], ...settings }, config);
  runtime.idleMs = SPARE_IDLE_MS;
  scheduleIdle(runtime);
  spare = { key, runtime };
}

/** The warmed spare for a folder, if one is running (its catalog saves starting a probe). */
const spareFor = cwd => (spare && JSON.parse(spare.key)[0] === cwd && live(spare.runtime.sessionId) ? spare.runtime : null);

/** Gives the warmed spare to a just-created session when its settings match. @returns {boolean} */
function adoptSpare(session, config) {
  if (!spare || spare.key !== spareKey(session) || !live(spare.runtime.sessionId)) return false;
  const { runtime } = spare;
  spare = null;
  runtimes.delete(runtime.sessionId);
  runtime.sessionId = session.id;
  runtime.idleMs = (config.idleMinutes || 20) * 60000;
  runtimes.set(session.id, runtime);
  scheduleIdle(runtime);
  return true;
}

const pendingFor = id => [...(runtimes.get(id)?.pending.values() || [])];
const close = id => { const runtime = runtimes.get(id); if (runtime) retire(runtime); };
const kill = id => runtimes.get(id)?.proc.kill();
const infoFor = id => ({ alive: Boolean(live(id)), ...(runtimes.get(id)?.info || {}) });

module.exports = {
  init, ensure, sendMessage, interrupt, answerPermission, control, applySettings, pendingFor, close, kill, infoFor,
  prewarm, prewarmNew, adoptSpare, spareFor,
};
