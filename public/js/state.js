/** Shared client state and the cached CLI catalog. Views read from here; app.js is the only writer of sessions. */
import { api } from './api.js';
import { buildCommands } from './command-catalog.js';

const RECENT_KEY = 'claude-gui.recent-folders';
const CATALOG_TTL_MS = 5 * 60000;

export const state = {
  sessions: new Map(), activeId: null, unread: new Set(),
  config: { defaultCwd: '' }, capabilities: { permissionModes: [], flags: [], version: null },
  live: new Map(), // sessionId -> { text, thinking } while tokens stream in
  runtime: new Map(), // sessionId -> facts from system/init (model, tools, MCP servers)
  context: new Map(), // sessionId -> context usage percentage
  turnStarted: new Map(), // sessionId -> timestamp of the running turn
  draft: { cwd: '', mode: 'acceptEdits', model: '', effort: '' }, // settings for the next new session
  focusView: false,
};

const catalogs = new Map(); // scope key -> { at, promise }

export const activeSession = () => state.sessions.get(state.activeId) || null;

/** Where panels and catalog requests apply: the active session, or the folder chosen for a new one. */
export function currentScope() {
  const session = activeSession();
  return session ? { sessionId: session.id } : { cwd: state.draft.cwd || state.config.defaultCwd };
}
export const scopeFolder = () => activeSession()?.cwd || state.draft.cwd || state.config.defaultCwd;

const scopeKey = scope => (scope.sessionId ? `s:${scope.sessionId}` : `f:${scope.cwd}`);

/**
 * Catalog (commands, skills, agents, models, output styles) for a scope; cached, never rejects.
 * @returns {Promise<object|null>}
 */
export function getCatalog(scope = currentScope(), { refresh = false } = {}) {
  const key = scopeKey(scope);
  const cached = catalogs.get(key);
  if (!refresh && cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.promise;
  const promise = api.catalog(scope).catch(error => {
    console.error('[state] catalog failed:', error);
    catalogs.delete(key);
    return null;
  });
  catalogs.set(key, { at: Date.now(), promise });
  return promise;
}

export function forgetCatalog(scope = currentScope()) {
  catalogs.delete(scopeKey(scope));
}

/** Slash-menu entries for a scope (built-in list merged with the live catalog). */
export async function getCommands(scope = currentScope()) {
  return buildCommands(await getCatalog(scope));
}

export function recentFolders() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function rememberFolder(folder) {
  const list = [folder, ...recentFolders().filter(item => item !== folder)].slice(0, 8);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage may be blocked */ }
}
