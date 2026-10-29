/**
 * One live CLI process per session: spawned on demand, kept warm while used, closed when idle.
 * Routes CLI output to the hooks given by session-service (which owns storage and broadcasting).
 */
const { startProcess } = require('./cli-process');
const { buildArgs } = require('./cli-args');
const { getCapabilities } = require('./cli-capabilities');
const { createSpare } = require('./runtime-spare');
const { createPermissions } = require('./runtime-permissions');
const { createRuntimeEvents } = require('./runtime-events');
const corrections = require('./runtime-corrections');
const { withCheckpointing } = require('./rewind/checkpoint-env');

const INTERRUPT_GRACE_MS = 6000;
const runtimes = new Map(); // app session id -> runtime
const starting = new Map(); // app session id -> Promise<runtime> while a start is in progress
let hooks = null;

/** @param {{onItem, onDelta, onInit, onSessionId, onUserReplay, onAssistantUuid, onTurnEnd, onTurnResume, onPermission, onPermissionResolved, onModeChange, onTask, onExit}} sessionHooks */
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

const permissions = createPermissions({ hooks: () => hooks, live, scheduleIdle });
const spare = createSpare({ runtimes, ensure, live, retire, scheduleIdle });

const events = createRuntimeEvents({ hooks: () => hooks, runtimes, scheduleIdle, permissions, spare });

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
  const args = buildArgs(session, config, capabilities);
  corrections.setUp(runtime, args.includes('--replay-user-messages'));
  runtime.proc = startProcess(withCheckpointing(config), args, session.cwd, {
    onMessage: event => events.handleMessage(runtime, event),
    onControlRequest: (id, request) => permissions.handleControlRequest(runtime, id, request),
    onControlCancel: id => permissions.resolvePermission(runtime, id),
    onExit: info => events.handleExit(runtime, info),
  });
  runtimes.set(session.id, runtime);
  runtime.initialize = runtime.proc.request('initialize', {}, 60000).catch(error => {
    console.error('[session-runtime] initialize failed:', error.message);
    return null;
  });
  scheduleIdle(runtime);
  return runtime;
}

/** Starts a turn. @param {string|object[]} content @param {string} [uuid] the message's id: the CLI replays it, which marks it a point to rewind to */
async function sendMessage(session, content, config, uuid) {
  const runtime = await ensure(session, config);
  if (!runtime.proc.send(content, { uuid })) throw new Error('Claude process is not running');
  runtime.turnActive = true;
  clearTimeout(runtime.idleTimer);
}

/** Interrupts the running turn; kills the process if it does not stop in time. */
async function interrupt(sessionId) {
  const runtime = live(sessionId);
  if (!runtime || !runtime.turnActive) return false;
  permissions.cancelAll(runtime);
  runtime.interruptTimer = setTimeout(() => runtime.turnActive && runtime.proc.kill(), INTERRUPT_GRACE_MS);
  await runtime.proc.request('interrupt', {}, INTERRUPT_GRACE_MS).catch(() => runtime.proc.kill());
  return true;
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
  if (['effort', 'fallbackModel', 'agent', 'addDirs', 'outputStyle'].some(key => key in patch)) restartLater();
  if (runtime.needsRestart && !runtime.turnActive && !runtime.pending.size) retire(runtime);
}

/** Starts the session's process ahead of its next message (the user is typing), so the turn starts at once. */
function prewarm(session, config) {
  return live(session.id) ? Promise.resolve(runtimes.get(session.id)) : ensure(session, config);
}

const pendingFor = id => [...(runtimes.get(id)?.pending.values() || [])];
const close = id => { const runtime = runtimes.get(id); if (runtime) retire(runtime); };
const kill = id => runtimes.get(id)?.proc.kill();
const infoFor = id => ({ alive: Boolean(live(id)), ...(runtimes.get(id)?.info || {}) });

/** A correction into the running turn (runtime-corrections.js). @returns {string|null} its uuid, null when it cannot go now */
function correct(sessionId, content) {
  const runtime = live(sessionId);
  return corrections.canCorrect(runtime) ? corrections.send(runtime, content) : null;
}

/** On a stop: corrections not taken in are dropped. @returns {Promise<string[]>} their uuids */
const dropCorrections = sessionId => (runtimes.get(sessionId)?.corrections ? corrections.dropWaiting(runtimes.get(sessionId)) : Promise.resolve([]));

module.exports = {
  init, ensure, sendMessage, interrupt, answerPermission: permissions.answerPermission, control, applySettings, pendingFor, close,
  kill, infoFor, prewarm, prewarmNew: spare.prewarmNew, adoptSpare: spare.adoptSpare, spareFor: spare.spareFor, correct, dropCorrections,
};
