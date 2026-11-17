/**
 * The Terminal pane's terminals, kept in server memory per session: each has its own working directory, which only
 * ever comes from the session's folder, an opened folder (terminal-folder.js) or the shell's own report after a command.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('../session-store');
const { httpError } = require('../http-utils');

const MAX_TERMINALS = 8; // per session
const terminals = new Map(); // sessionId -> Map(terminalId -> { id, cwd })

const isDirectory = target => { try { return fs.statSync(target).isDirectory(); } catch { return false; } };

/** Forgets the terminals of sessions that no longer exist (a deleted session's commands were stopped by its delete). */
function prune() {
  for (const sessionId of terminals.keys()) if (!store.get(sessionId)) terminals.delete(sessionId);
}

/** @returns {{id:string, cwd:string}[]} the session's terminals, oldest first */
const listTerminals = sessionId => [...(terminals.get(sessionId)?.values() || [])];

/** @returns {{id:string, cwd:string}|null} */
const getTerminal = (sessionId, terminalId) => terminals.get(sessionId)?.get(terminalId) || null;

/**
 * @param {string} sessionId @param {string} startDir an existing folder (the session's or one resolved from its folders)
 * @returns {{id:string, cwd:string}}
 */
function createTerminal(sessionId, startDir) {
  prune();
  const own = terminals.get(sessionId) || new Map();
  if (own.size >= MAX_TERMINALS) throw httpError(409, `אפשר לפתוח עד ${MAX_TERMINALS} טרמינלים בסשן`);
  const terminal = { id: crypto.randomUUID(), cwd: startDir };
  own.set(terminal.id, terminal);
  terminals.set(sessionId, own);
  return terminal;
}

/** @returns {boolean} the terminal existed */
const removeTerminal = (sessionId, terminalId) => Boolean(terminals.get(sessionId)?.delete(terminalId));

/**
 * The folder the next command starts in: the terminal's own while it exists, else the nearest folder above it that
 * does, else the session's folder. Always a real directory (the caller checked that the session's folder is there).
 */
function startDirectory(terminal, sessionCwd) {
  for (let dir = terminal.cwd; ; dir = path.dirname(dir)) {
    if (isDirectory(dir)) return dir;
    if (path.dirname(dir) === dir) return sessionCwd;
  }
}

/** Takes the folder the shell reported after a command, only when it is a real directory. @returns {boolean} taken */
function learnCwd(terminal, reported) {
  if (typeof reported !== 'string' || !path.isAbsolute(reported) || !isDirectory(reported)) return false;
  terminal.cwd = reported;
  return true;
}

module.exports = { MAX_TERMINALS, listTerminals, getTerminal, createTerminal, removeTerminal, startDirectory, learnCwd };
