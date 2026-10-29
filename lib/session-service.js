/**
 * Business logic: glues the session store, the live CLI runtime and the event hub together. Messages and the queue
 * are session-messages.js; the shared helpers are session-common.js.
 */
const path = require('path');
const store = require('./session-store');
const runtime = require('./session-runtime');
const { broadcast } = require('./event-hub');
const { httpError } = require('./http-utils');
const images = require('./images');
const uploads = require('./uploads');
const tasks = require('./task-tracker');
const { createWorktree } = require('./git/worktree');
const { removeWorktree } = require('./git/worktree-remove');
const { DEFAULT_MODE, toMeta, withItems, publish, pushItem, requireSession, requireRunnable, requireMode, requireFolder } = require('./session-common');
const messages = require('./session-messages');
const { stopRun } = require('./terminal/shell-runs');
const shellContext = require('./terminal/shell-context');

const SETTING_KEYS = ['mode', 'model', 'effort', 'agent', 'outputStyle', 'addDirs'];

require('./session-events'); // what the live CLI reports goes to the store and the browsers

/**
 * Stores and announces a session. `worktree` comes only from the server itself (startSession, a fork), never from a
 * request: its path is what deleting the session may remove.
 * @returns {object} the new session (with items). Throws 400 if the folder does not exist.
 */
function createSession({ name, cwd, mode, model, effort, claudeSessionId, forkPending, items, worktree = null }, config) {
  const folder = requireFolder(cwd || config.defaultCwd);
  const session = store.create({
    name: name || path.basename(worktree?.source || folder) || folder, cwd: folder, mode: requireMode(mode || DEFAULT_MODE),
    model: model || '', effort: effort || '', claudeSessionId: claudeSessionId || null,
    forkPending: Boolean(forkPending), items: items || [], worktree,
  });
  if (!claudeSessionId) runtime.adoptSpare(session, config); // a process warmed while the first message was typed
  publish(session);
  return withItems(session);
}

/**
 * POST /api/sessions: a new session from the welcome page. `worktree: true` first gives it its own git worktree
 * (lib/git/worktree.js) and runs it there; if that fails, no session is created.
 * @returns {Promise<object>} the session; `notice` when the chosen subfolder is not in the worktree
 */
async function startSession({ name, cwd, mode, model, effort, worktree }, config) {
  const folder = requireFolder(cwd || config.defaultCwd);
  if (worktree !== true) return createSession({ name, cwd: folder, mode, model, effort }, config);
  const made = await createWorktree({ cwd: folder }).catch(error => { throw httpError(400, error.message); });
  const session = createSession({ name, cwd: made.cwd, mode, model, effort, worktree: made.worktree }, config);
  return made.subfolderMissing ? { ...session, notice: 'תת-התיקייה שנבחרה אינה ב-commit, ולכן הסשן נפתח בתיקייה הראשית של ה-worktree.' } : session;
}

/** Renames or changes settings. Settings reach a running CLI live when possible, otherwise on its next start. */
async function updateSession(id, patch, config) {
  const current = requireSession(id);
  const changes = {};
  if (typeof patch.name === 'string' && patch.name.trim()) changes.name = patch.name.trim();
  if (patch.mode !== undefined) changes.mode = requireMode(patch.mode);
  // Sidebar only, not a CLI setting; an archived session is never pinned (session-archive.js).
  if (typeof patch.pinned === 'boolean' && !current.archived) changes.pinned = patch.pinned;
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
    ? runtime.prewarm(requireRunnable(requireSession(target.sessionId)), config)
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

/**
 * @param {{removeWorktree?:boolean}} [options] also remove the session's worktree folder (never its branch); it is
 *   kept when another session (a fork) still works in it, or when git refuses (uncommitted changes)
 * @returns {Promise<{worktreeRemoved:boolean, worktreeError?:string}>}
 */
async function deleteSession(id, { removeWorktree: remove = false } = {}) {
  const session = requireSession(id);
  runtime.kill(id);
  stopRun(id); // a command of the Terminal pane or a `!` command dies with its session
  store.remove(id);
  tasks.forget(id);
  images.removeImages(imageIdsOf(session), imagesInUse()); // a fork may still show the same images
  uploads.removeFiles(idsOf(session, 'files'), filesInUse());
  broadcast({ type: 'removed', sessionId: id });
  if (!remove || !session.worktree) return { worktreeRemoved: false };
  if (store.list().some(other => other.worktree?.path === session.worktree.path)) {
    return { worktreeRemoved: false, worktreeError: 'סשן אחר עדיין עובד ב-worktree הזה.' };
  }
  const result = await removeWorktree(session.worktree);
  return { worktreeRemoved: result.removed, ...(result.error && { worktreeError: result.error }) };
}

/** Starts a new CLI conversation in the same session (like /clear); the old one stays resumable. */
function clearConversation(id) {
  const session = requireSession(id);
  if (session.status === 'running') throw httpError(409, 'הסשן עדיין רץ');
  runtime.close(id);
  shellContext.clear(id); // commands waiting to be told to Claude belong to the cleared conversation
  publish(store.update(id, { claudeSessionId: null, forkPending: false }));
  pushItem(id, { kind: 'divider', text: 'שיחה חדשה – ההקשר נוקה' });
}

/** Copies the conversation into a new session that continues from the same point (like /fork, /branch). */
function forkSession(id, config) {
  const source = requireSession(id);
  if (!source.claudeSessionId) throw httpError(400, 'אין עדיין שיחה לפצל. שלח הודעה קודם.');
  return createSession({
    name: `${source.name} (ענף)`, cwd: source.cwd, mode: source.mode, model: source.model, effort: source.effort,
    claudeSessionId: source.claudeSessionId, forkPending: true, worktree: source.worktree || null, // works in the same worktree
    items: [...source.items, { kind: 'divider', text: 'ענף חדש מכאן' }],
  }, config);
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
  createSession, startSession, updateSession, deleteSession, warm, clearConversation, forkSession, answerPermission, requireSession,
  sendMessage: messages.sendMessage, stopSession: messages.stopSession, removeQueued: messages.removeQueued,
  resumeQueue: messages.resumeQueue, listSessions: () => store.list().map(withItems),
};
