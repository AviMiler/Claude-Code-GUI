/**
 * The real context window of a session's model, as the server found it (config.json, Ollama's num_ctx, the loaded
 * model, the model's maximum). Fetched once per session and model, kept 5 minutes (a failure too, so a redraw never
 * loops into requests); views never wait for it: they draw with what is known and draw again when the answer changes.
 */
import { api } from '../api.js';

const TTL_MS = 5 * 60000;
const entries = new Map(); // sessionId -> { key, at, value, promise }

const keyOf = session => String(session.model || '');
const isFresh = (entry, session) => entry && entry.key === keyOf(session) && Date.now() - entry.at < TTL_MS;

/** @returns {Promise<object|null>} the window answer; null when the server could not be asked */
export function loadWindow(session) {
  const entry = entries.get(session.id);
  if (isFresh(entry, session)) return entry.promise;
  const next = { key: keyOf(session), at: Date.now(), value: entry?.key === keyOf(session) ? entry.value : undefined, promise: null };
  next.promise = api.contextWindow(session.id).then(value => { next.value = value; return value; })
    .catch(() => { next.value ??= null; return null; }); // an old server (404) or a removed session
  entries.set(session.id, next);
  return next.promise;
}

/**
 * @param {{id:string, model?:string}} session
 * @param {()=>void} [onChange] called when a fetch brings a different answer than the one returned now
 * @returns {{window:number|null, source:string|null, estimate:boolean, warnPercent:number}|null|undefined}
 *   undefined: not known yet; null: the server could not tell
 */
export function peekWindow(session, onChange) {
  const entry = entries.get(session.id);
  const before = entry?.key === keyOf(session) ? entry.value : undefined;
  if (!isFresh(entry, session)) {
    loadWindow(session).then(value => { if (JSON.stringify(value ?? null) !== JSON.stringify(before ?? null) || before === undefined) onChange?.(); });
  }
  return before;
}
