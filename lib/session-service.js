/** Business logic: glues the session store, the live CLI runtime and the event hub together. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./session-store');
const runtime = require('./session-runtime');
const { broadcast } = require('./event-hub');
const { httpError } = require('./http-utils');
const { describeFailure } = require('./failure-messages');
const images = require('./images');
const uploads = require('./uploads');

const VALID_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'auto', 'dontAsk'];
const DEFAULT_MODE = 'acceptEdits';
const SETTING_KEYS = ['mode', 'model', 'effort', 'agent', 'outputStyle', 'addDirs'];
const MAX_QUEUE = 20;
const stopRequested = new Set();
// Config of the last request; queued messages start later, from a turn end that carries no config.
let lastConfig = null;

/** Session without its (large) item list, plus live runtime facts. */
function toMeta(session) {
  const { items, ...meta } = session;
  return { ...meta, pendingPermissions: runtime.pendingFor(session.id) };
}
const withItems = session => ({ ...toMeta(session), items: session.items });
const publish = session => broadcast({ type: 'session', session: toMeta(session) });

function pushItem(sessionId, item) {
  store.addItem(sessionId, item);
  broadcast({ type: 'item', sessionId, item });
}

function setStatus(sessionId, status) {
  if (!store.get(sessionId) || store.get(sessionId).status === status) return;
  store.update(sessionId, { status });
  broadcast({ type: 'status', sessionId, status });
}

function requireSession(id) {
  const session = store.get(id);
  if (!session) throw httpError(404, 'הסשן לא נמצא');
  return session;
}

function requireMode(mode) {
  const normalized = mode === 'manual' ? 'default' : mode;
  if (!VALID_MODES.includes(normalized)) throw httpError(400, 'מצב הרשאות לא מוכר');
  return normalized;
}

function requireFolder(folder) {
  if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw httpError(400, `התיקייה לא קיימת: ${folder}`);
  }
  return folder;
}

runtime.init({
  onItem(id, item) {
    if (!store.get(id)) return;
    if (item.kind === 'result') {
      store.update(id, { costUsd: (store.get(id).costUsd || 0) + (item.costUsd || 0) });
      publish(store.get(id));
      if (stopRequested.delete(id) && item.isError) return pushItem(id, { kind: 'notice', text: 'הריצה הופסקה.', stopped: true });
    }
    pushItem(id, item);
  },
  onDelta: (id, delta) => broadcast({ type: 'delta', sessionId: id, ...delta }),
  onInit: (id, info) => broadcast({ type: 'runtime', sessionId: id, info: { ...info, tools: info.tools.length } }),
  onSessionId(id, claudeSessionId) {
    const session = store.get(id);
    if (session && session.claudeSessionId !== claudeSessionId) {
      publish(store.update(id, { claudeSessionId, forkPending: false }));
    }
  },
  onTurnEnd(id) {
    setStatus(id, 'idle');
    setImmediate(() => dispatchNext(id)); // after the result is out, like pressing Enter again
  },
  onPermission: (id, prompt) => broadcast({ type: 'permission', sessionId: id, prompt }),
  onPermissionResolved: (id, requestId) => broadcast({ type: 'permission-resolved', sessionId: id, requestId }),
  onModeChange(id, mode) {
    const session = store.get(id);
    const normalized = mode === 'manual' ? 'default' : mode;
    if (session && VALID_MODES.includes(normalized) && session.mode !== normalized) {
      publish(store.update(id, { mode: normalized }));
    }
  },
  onExit(id, info) {
    if (!store.get(id)) return;
    // A process that exits between turns (idle timeout, restart) is not news.
    if (!info.duringTurn && !info.spawnError) return;
    if (stopRequested.delete(id)) pushItem(id, { kind: 'notice', text: 'הריצה הופסקה.', stopped: true });
    else if (!info.killed) pushItem(id, { kind: 'error', text: describeFailure(info) });
    setStatus(id, 'idle');
  },
});

/** @returns {object} the new session (with items). Throws 400 if the folder does not exist. */
function createSession({ name, cwd, mode, model, effort, claudeSessionId, forkPending, items }, config) {
  const folder = requireFolder(cwd || config.defaultCwd);
  const session = store.create({
    name: name || path.basename(folder) || folder, cwd: folder, mode: requireMode(mode || DEFAULT_MODE),
    model: model || '', effort: effort || '', claudeSessionId: claudeSessionId || null,
    forkPending: Boolean(forkPending), items: items || [],
  });
  if (!claudeSessionId) runtime.adoptSpare(session, config); // a process warmed while the first message was typed
  publish(session);
  return withItems(session);
}

/** Renames or changes settings. Settings reach a running CLI live when possible, otherwise on its next start. */
async function updateSession(id, patch, config) {
  requireSession(id);
  const changes = {};
  if (typeof patch.name === 'string' && patch.name.trim()) changes.name = patch.name.trim();
  if (patch.mode !== undefined) changes.mode = requireMode(patch.mode);
  for (const key of ['model', 'effort', 'agent', 'outputStyle']) {
    if (typeof patch[key] === 'string') changes[key] = patch[key].trim();
  }
  if (Array.isArray(patch.addDirs)) changes.addDirs = patch.addDirs.map(dir => requireFolder(String(dir).trim()));
  const session = store.update(id, changes);
  publish(session);
  const settingsChanged = Object.fromEntries(Object.entries(changes).filter(([key]) => SETTING_KEYS.includes(key)));
  if (Object.keys(settingsChanged).length) await runtime.applySettings(session, settingsChanged, config);
  return toMeta(session);
}

/**
 * Starts the CLI while the user types, so sending does not wait for its startup.
 * @param {{sessionId?:string, cwd?:string, mode?:string, model?:string, effort?:string}} target
 */
function warm(target, config) {
  const started = target.sessionId
    ? runtime.prewarm(requireSession(target.sessionId), config)
    : runtime.prewarmNew({
      cwd: requireFolder(target.cwd || config.defaultCwd), mode: requireMode(target.mode || DEFAULT_MODE),
      model: target.model || '', effort: target.effort || '',
    }, config);
  started.catch(error => console.error('[session-service] warm-up failed:', error.message));
}

/** Ids of images / files some message (or queued message) of a session refers to. */
const idsOf = (session, key) => [...session.items, ...(session.queue || [])].flatMap(entry => (entry[key] || []).map(item => item.id));
const imageIdsOf = session => idsOf(session, 'images');
const imagesInUse = () => new Set(store.list().flatMap(imageIdsOf));
const filesInUse = () => new Set(store.list().flatMap(session => idsOf(session, 'files')));

function deleteSession(id) {
  const session = requireSession(id);
  runtime.kill(id);
  store.remove(id);
  images.removeImages(imageIdsOf(session), imagesInUse()); // a fork may still show the same images
  uploads.removeFiles(idsOf(session, 'files'), filesInUse());
  broadcast({ type: 'removed', sessionId: id });
}

/** @param {object[]} attached stored images @param {object[]} files stored files (sent as paths) */
async function startTurn(id, text, config, attached = [], files = []) {
  const session = requireSession(id);
  pushItem(id, { kind: 'user', text, ...(attached.length && { images: attached }), ...(files.length && { files }) });
  setStatus(id, 'running');
  try {
    await runtime.sendMessage(session, images.userContent(uploads.messageText(text, files), attached), config);
  } catch (error) {
    console.error('[session-service] cannot start turn:', error);
    pushItem(id, { kind: 'error', text: `לא ניתן להפעיל את Claude: ${error.message}` });
    setStatus(id, 'idle');
  }
}

/**
 * Starts a turn, or queues the message while one is running (sent when the turn ends).
 * Output arrives later through broadcast events.
 * @param {object[]} [attachedImages] new images ({ data, mediaType, name }) or stored ones ({ ref }); see lib/images.js
 * @param {object[]} [attachedFiles] other files ({ data, name } or { ref, name }); see lib/uploads.js
 * @returns {Promise<{queued:boolean}>}
 */
async function sendMessage(id, text, config, attachedImages, attachedFiles) {
  const session = requireSession(id);
  const message = typeof text === 'string' ? text.trim() : '';
  if (!message && !attachedImages?.length && !attachedFiles?.length) throw httpError(400, 'ההודעה ריקה');
  const queue = session.queue || [];
  if (session.status === 'running' && queue.length >= MAX_QUEUE) throw httpError(409, `התור מלא (${MAX_QUEUE} הודעות)`);
  const attached = images.saveImages(attachedImages);
  const files = uploads.saveFiles(attachedFiles);
  lastConfig = config;
  if (session.status === 'running') {
    const entry = { id: crypto.randomUUID(), text: message, ...(attached.length && { images: attached }), ...(files.length && { files }), at: Date.now() };
    publish(store.update(id, { queue: [...queue, entry] }));
    return { queued: true };
  }
  await startTurn(id, message, config, attached, files);
  return { queued: false };
}

/** Sends the first queued message when the session is idle. */
function dispatchNext(id) {
  const session = store.get(id);
  if (!session || session.status === 'running' || !session.queue?.length || !lastConfig) return;
  const [next, ...rest] = session.queue;
  publish(store.update(id, { queue: rest }));
  startTurn(id, next.text, lastConfig, next.images || [], next.files || []).catch(error => console.error('[session-service] queued turn failed:', error));
}

function removeQueued(id, queueId) {
  const session = requireSession(id);
  const queue = session.queue || [];
  if (!queue.some(entry => entry.id === queueId)) throw httpError(404, 'ההודעה כבר לא בתור');
  publish(store.update(id, { queue: queue.filter(entry => entry.id !== queueId) }));
}

/** Continues a queue that stopped (a failed turn, or a server restart). */
function resumeQueue(id, config) {
  requireSession(id);
  lastConfig = config;
  dispatchNext(id);
}

/**
 * Stops the running turn. Queued messages are taken off the queue and returned (like Esc in the terminal,
 * which puts them back in the input), so a stop never sends the next one by itself.
 * Their images and files stay stored, so the browser can send them again by reference.
 * @returns {Promise<{stopped:boolean, queued:{text:string, images:object[], files:object[]}[]}>}
 */
async function stopSession(id) {
  const session = requireSession(id);
  const queued = session.queue || [];
  if (queued.length) publish(store.update(id, { queue: [] }));
  stopRequested.add(id);
  const stopped = await runtime.interrupt(id);
  if (!stopped) {
    stopRequested.delete(id);
    if (queued.length && store.get(id)) publish(store.update(id, { queue: [...queued, ...(store.get(id).queue || [])] }));
    return { stopped, queued: [] };
  }
  return { stopped, queued: queued.map(entry => ({ text: entry.text, images: entry.images || [], files: entry.files || [] })) };
}

/** Starts a new CLI conversation in the same session (like /clear); the old one stays resumable. */
function clearConversation(id) {
  const session = requireSession(id);
  if (session.status === 'running') throw httpError(409, 'הסשן עדיין רץ');
  runtime.close(id);
  publish(store.update(id, { claudeSessionId: null, forkPending: false }));
  pushItem(id, { kind: 'divider', text: 'שיחה חדשה – ההקשר נוקה' });
}

/** Copies the conversation into a new session that continues from the same point (like /fork, /branch). */
function forkSession(id, config) {
  const source = requireSession(id);
  if (!source.claudeSessionId) throw httpError(400, 'אין עדיין שיחה לפצל. שלח הודעה קודם.');
  const fork = createSession({
    name: `${source.name} (ענף)`, cwd: source.cwd, mode: source.mode, model: source.model, effort: source.effort,
    claudeSessionId: source.claudeSessionId, forkPending: true,
    items: [...source.items, { kind: 'divider', text: 'ענף חדש מכאן' }],
  }, config);
  return fork;
}

function answerPermission(id, requestId, answer) {
  requireSession(id);
  const prompt = runtime.answerPermission(id, requestId, answer || {});
  if (!prompt) throw httpError(404, 'בקשת ההרשאה כבר לא ממתינה');
  if (answer.setMode) publish(store.update(id, { mode: requireMode(answer.setMode) }));
  return { ok: true };
}

// Images of messages taken off the queue (removed, edited, stopped) wait here until they are sent again or swept.
images.sweep(imagesInUse());
uploads.sweep(filesInUse());

module.exports = {
  createSession, updateSession, deleteSession, warm, sendMessage, stopSession, removeQueued, resumeQueue, clearConversation, forkSession,
  answerPermission, requireSession, listSessions: () => store.list().map(withItems),
};
