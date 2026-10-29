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
const { DEFAULT_MODE, toMeta, withItems, publish, pushExtra, requireSession, requireRunnable, requireMode, requireFolder } = require('./session-common');
const messages = require('./session-messages');
const { textChanges, copiedOptions } = require('./session-options'); const { removePromptFile } = require('./session-prompt');
const { stopRun } = require('./terminal/shell-runs');
const shellContext = require('./terminal/shell-context');
const cliSync = require('./session-cli-sync');

const SETTING_KEYS = ['mode', 'model', 'effort', 'fallbackModel', 'thinkingOff', 'systemPrompt', 'systemPromptMode', 'agent', 'outputStyle', 'addDirs'];

require('./session-events'); // what the live CLI reports goes to the store and the browsers

/**
 * Stores and announces a session. `worktree` comes only from the server itself (startSession, a fork), never from a
 * request: its path is what deleting the session may remove.
 * @returns {object} the new session (with items). Throws 400 if the folder does not exist.
 */
function createSession({ name, named = false, cwd, mode, model, effort, fallbackModel, claudeSessionId, forkPending, history, worktree = null, options }, config) {
  const folder = requireFolder(cwd || config.defaultCwd);
  const session = store.create({
    name: name || path.basename(worktree?.source || folder) || folder, named, cwd: folder, mode: requireMode(mode || DEFAULT_MODE),
    model: model || '', effort: effort || '', fallbackModel: fallbackModel || '', claudeSessionId: claudeSessionId || null,
    forkPending: Boolean(forkPending), history, worktree, options,
  });
  if (!claudeSessionId) runtime.adoptSpare(session, config); // a process warmed while the first message was typed
  cliSync.refresh(session.id); // a conversation it continues (import, fork) is shown from the CLI's file
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
  if (typeof patch.name === 'string' && patch.name.trim()) Object.assign(changes, { name: patch.name.trim(), named: true });
  if (patch.mode !== undefined) changes.mode = requireMode(patch.mode, patch.safeMode ?? current.safeMode); // safe mode: no mode that approves by itself
  // Sidebar only, not a CLI setting; an archived session is never pinned (session-archive.js).
  if (typeof patch.pinned === 'boolean' && !current.archived) changes.pinned = patch.pinned;
  Object.assign(changes, textChanges(patch, current, config));
  if (Array.isArray(patch.addDirs)) changes.addDirs = patch.addDirs.map(dir => requireFolder(String(dir).trim()));
  const session = store.update(id, changes);
  publish(session);
  if (changes.name) await cliSync.pushName(id); // so `claude --resume` lists it under the same name
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

/** Ids of images / files some message (shown, sent, kept by the GUI or queued) of a session refers to. */
const idsOf = (session, key) => [...session.items, ...Object.values(session.sent || {}), ...(session.extras || []).map(extra => extra.item), ...(session.queue || [])]
  .flatMap(entry => (entry[key] || []).map(item => item.id));
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
  tasks.forget(id); removePromptFile(id);
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

/**
 * Starts a new CLI conversation in the same session (like /clear); the old one stays resumable, and stays shown above
 * the new one (from its file).
 */
function clearConversation(id) {
  const session = requireSession(id);
  if (session.status === 'running') throw httpError(409, 'הסשן עדיין רץ');
  runtime.close(id);
  shellContext.clear(id); // commands waiting to be told to Claude belong to the cleared conversation
  const conversations = [...(session.conversations || []), ...(session.claudeSessionId && !session.forkPending ? [session.claudeSessionId] : [])];
  publish(store.update(id, { claudeSessionId: null, forkPending: false, resumeAt: null, conversations }));
  pushExtra(id, { kind: 'divider', text: 'שיחה חדשה – ההקשר נוקה', cleared: true }); // `cleared`: the Plan pane starts over here
}

/**
 * A new session that continues the conversation from the same point (like /fork, /branch): the CLI copies it
 * (--fork-session, same line uuids), so the GUI's own items and how it showed its messages carry over as they are.
 */
function forkSession(id, config) {
  const source = requireSession(id);
  if (!source.claudeSessionId) throw httpError(400, 'אין עדיין שיחה לפצל. שלח הודעה קודם.');
  const divider = { anchors: source.anchors || [], item: { kind: 'divider', text: 'ענף חדש מכאן' } };
  return createSession({
    name: `${source.name} (ענף)`, named: true, cwd: source.cwd, mode: source.mode, model: source.model, effort: source.effort, fallbackModel: source.fallbackModel, options: copiedOptions(source),
    claudeSessionId: source.claudeSessionId, forkPending: true, worktree: source.worktree || null, // works in the same worktree
    history: { conversations: [...(source.conversations || [])], extras: [...(source.extras || []), divider], sent: { ...source.sent }, anchors: source.anchors || [] },
  }, config);
}

function answerPermission(id, requestId, answer) {
  const safe = requireSession(id).safeMode; if (answer?.setMode) requireMode(answer.setMode, safe); // a mode the session refuses never reaches the CLI
  const prompt = runtime.answerPermission(id, requestId, answer || {});
  if (!prompt) throw httpError(404, 'בקשת ההרשאה כבר לא ממתינה');
  if (answer.setMode) publish(store.update(id, { mode: requireMode(answer.setMode, store.get(id).safeMode) }));
  return { ok: true };
}

/**
 * Removes attachments no session refers to. Images of messages taken off the queue (removed, edited, stopped) wait
 * until they are sent again or swept. Called by server.js once every session's items were built from the CLI's files
 * (session-cli-sync.js start): before that, images only those items refer to would count as unused.
 */
function sweepAttachments() {
  images.sweep(imagesInUse());
  uploads.sweep(filesInUse());
}

module.exports = {
  createSession, startSession, updateSession, deleteSession, sweepAttachments, warm, clearConversation, forkSession, answerPermission, requireSession,
  sendMessage: messages.sendMessage, stopSession: messages.stopSession, removeQueued: messages.removeQueued,
  resumeQueue: messages.resumeQueue,
  /** All sessions, each as its CLI conversation is now. */
  listSessions() {
    cliSync.refreshAll();
    return store.list().map(withItems);
  },
};
