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

const catalogs = new Map(); // scope key -> { at, promise, value }
let systemModels = null; // Promise of /api/models
let modelsSnapshot = null; // last result of getModels, for views that must not wait

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
  const entry = { at: Date.now(), promise: null, value: undefined };
  entry.promise = api.catalog(scope).then(value => { entry.value = value; return value; }).catch(error => {
    console.error('[state] catalog failed:', error);
    catalogs.delete(key);
    return null;
  });
  catalogs.set(key, entry);
  return entry.promise;
}

/** The catalog if it already arrived (undefined otherwise). Menus show this at once instead of waiting for the CLI. */
export function peekCatalog(scope = currentScope()) {
  const cached = catalogs.get(scopeKey(scope));
  return cached && Date.now() - cached.at < CATALOG_TTL_MS ? cached.value : undefined;
}

/**
 * Models the user can switch between. With a custom model server (Ollama...) they come from that server and
 * config.json; otherwise from the CLI's own list.
 * @returns {Promise<{models:object[], switchable:boolean, current:string, error:string|null}>}
 */
export async function getModels(scope = currentScope()) {
  systemModels ||= api.models().catch(error => { systemModels = null; return { source: 'cli', models: [], current: '', error: error.message }; });
  const system = await systemModels;
  const models = system.source === 'server' ? system.models : ((await getCatalog(scope))?.models || []);
  modelsSnapshot = { models, switchable: models.length > 1, current: system.current, error: system.error };
  return modelsSnapshot;
}

/** The last model list without waiting (null before the first answer). */
export const peekModels = () => modelsSnapshot;

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
