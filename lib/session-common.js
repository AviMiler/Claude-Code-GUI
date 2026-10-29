/** What the session modules share: the store's session as the browser gets it, live events, and input checks. */
const fs = require('fs');
const store = require('./session-store');
const runtime = require('./session-runtime');
const { broadcast } = require('./event-hub');
const { httpError } = require('./http-utils');
const tasks = require('./task-tracker');
const { isForbidden } = require('./session-safe-mode');

const VALID_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'auto', 'dontAsk'];
const DEFAULT_MODE = 'acceptEdits';

/** Session without its (large) item list, plus live runtime facts. */
function toMeta(session) {
  const { items, ...meta } = session;
  return { ...meta, pendingPermissions: runtime.pendingFor(session.id), tasks: tasks.list(session.id) };
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

function requireMode(mode, safe = false) {
  const normalized = mode === 'manual' ? 'default' : mode;
  if (!VALID_MODES.includes(normalized)) throw httpError(400, 'מצב הרשאות לא מוכר');
  if (safe && isForbidden(normalized)) throw httpError(400, 'במצב בטוח אי אפשר לעבור למצב שמאשר בלי אדם');
  return normalized;
}

/**
 * A session whose folder is gone (an archived session's worktree that archiving removed) must not start a CLI: the
 * failed start would end up in its transcript as a wrong "check claudePath" error.
 */
function requireRunnable(session) {
  if (fs.existsSync(session.cwd)) return session;
  throw httpError(409, session.archived ? 'הסשן בארכיון ותיקיית ה-worktree שלו הוסרה. שחזר אותו מהארכיון כדי להמשיך.'
    : `תיקיית הסשן לא קיימת: ${session.cwd}`);
}

function requireFolder(folder) {
  if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw httpError(400, `התיקייה לא קיימת: ${folder}`);
  }
  return folder;
}

module.exports = {
  VALID_MODES, DEFAULT_MODE, toMeta, withItems, publish, pushItem, setStatus, requireSession, requireRunnable, requireMode, requireFolder,
};
