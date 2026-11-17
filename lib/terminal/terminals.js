/**
 * The Terminal pane's terminals, kept in server memory per session: each has its own working directory, which only
 * ever comes from the session's folder, an opened folder (terminal-folder.js) or the shell's own report after a command.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('../session-store');
const { httpError } = require('../http-utils');
const { realOrNull, isInside, rootsOf } = require('../files/safe-path');

const MAX_TERMINALS = 8; // per session
const terminals = new Map(); // sessionId -> Map(terminalId -> { id, n, cwd })
const counters = new Map(); // sessionId -> how many terminals it opened (the tab's number: "טרמינל n")

const isDirectory = target => { try { return fs.statSync(target).isDirectory(); } catch { return false; } };

/** Forgets the terminals of sessions that no longer exist (a deleted session's commands were stopped by its delete). */
function prune() {
  for (const sessionId of terminals.keys()) if (!store.get(sessionId)) { terminals.delete(sessionId); counters.delete(sessionId); }
}

/** @returns {{id:string, n:number, cwd:string}[]} the session's terminals, oldest first */
const listTerminals = sessionId => [...(terminals.get(sessionId)?.values() || [])];

/** @returns {{id:string, n:number, cwd:string}|null} */
const getTerminal = (sessionId, terminalId) => terminals.get(sessionId)?.get(terminalId) || null;

/**
 * @param {string} sessionId @param {string} startDir an existing folder (the session's or one resolved from its folders)
 * @returns {{id:string, n:number, cwd:string}}
 */
function createTerminal(sessionId, startDir) {
  prune();
  const own = terminals.get(sessionId) || new Map();
  if (own.size >= MAX_TERMINALS) throw httpError(409, `אפשר לפתוח עד ${MAX_TERMINALS} טרמינלים בסשן`);
  const n = (counters.get(sessionId) || 0) + 1;
  counters.set(sessionId, n);
  const terminal = { id: crypto.randomUUID(), n, cwd: startDir };
  own.set(terminal.id, terminal);
  terminals.set(sessionId, own);
  return terminal;
}

/** @returns {boolean} the terminal existed */
const removeTerminal = (sessionId, terminalId) => Boolean(terminals.get(sessionId)?.delete(terminalId));

/** The real path of `target` when it is an existing directory inside one of the session's folders (the guard), else null. */
function allowedFolder(session, target) {
  const real = typeof target === 'string' && path.isAbsolute(target) ? realOrNull(target) : null;
  return real && isDirectory(real) && rootsOf(session).some(root => isInside(real, root)) ? real : null;
}

/**
 * The folder the next command starts in: the terminal's own while it exists and is still inside the session's folders,
 * else the nearest folder above it that does, else the session's folder. Always a real directory.
 */
function startDirectory(terminal, session) {
  for (let dir = terminal.cwd; ; dir = path.dirname(dir)) {
    const allowed = allowedFolder(session, dir);
    if (allowed) return allowed;
    if (path.dirname(dir) === dir) return session.cwd;
  }
}

/**
 * Takes the folder the shell reported after a command, only when it is a real directory inside the session's folders
 * (a `cd ..` out of them is refused: the terminal stays where it was). @returns {boolean} taken
 */
function learnCwd(terminal, reported, session) {
  const allowed = allowedFolder(session, reported);
  if (!allowed) return false;
  terminal.cwd = allowed;
  return true;
}

module.exports = { MAX_TERMINALS, listTerminals, getTerminal, createTerminal, removeTerminal, startDirectory, learnCwd };
