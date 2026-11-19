/**
 * Folders a GET request may name with `?cwd=`. A GET can be triggered by any page that navigates to the GUI, so it must
 * not start work in an arbitrary folder: only a folder the server already knows is accepted, validated the way
 * createSession validates one (it must exist and be a folder). Known: the default folder, a folder of a stored session,
 * a folder shown by the folder picker (GET /api/folders) or created there, and one the welcome page chose (the POST
 * /api/worktree/probe, which carries the custom header and is sent as soon as the draft folder changes).
 */
const path = require('path');
const { httpError } = require('./http-utils');
const { requireFolder } = require('./session-common');
const store = require('./session-store');
const { isChatFolder } = require('./chat-folder');

const MAX_REMEMBERED = 300;
const remembered = new Set();
const keyOf = folder => (process.platform === 'win32' ? path.resolve(folder).toLowerCase() : path.resolve(folder));

/** Remembers a folder the user chose. Returns it unchanged. */
function rememberFolder(folder) {
  if (typeof folder !== 'string' || !folder) return folder;
  remembered.delete(keyOf(folder)); // re-insert last, so the oldest ones are dropped first
  remembered.add(keyOf(folder));
  if (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.values().next().value);
  return folder;
}

function isKnownFolder(folder, config) {
  const key = keyOf(folder);
  return key === keyOf(config.defaultCwd) || isChatFolder(folder) || remembered.has(key) || store.list().some(session => keyOf(session.cwd) === key);
}

/** The folder of a draft (no session yet) for a GET: validated, and only a known one. */
function knownFolder(config, cwd) {
  if (!cwd) return config.defaultCwd;
  if (typeof cwd !== 'string') throw httpError(400, 'תיקייה לא תקינה');
  requireFolder(cwd);
  if (!isKnownFolder(cwd, config)) throw httpError(403, 'התיקייה לא נבחרה דרך בורר התיקיות');
  return cwd;
}

module.exports = { rememberFolder, knownFolder };
