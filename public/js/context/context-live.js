/**
 * The CLI's own context reading (get_context_usage), kept per session in state.context for the shared context model
 * (context-info.js). Background reads pass ifRunning, so they never start a Claude Code process; the reading makes no
 * model call. A CLI that lacks the request (2.1.246) is remembered and not asked again: the estimate takes over.
 */
import { api } from '../api.js';
import { state } from '../state.js';
import { isUnsupported } from '../panels/kit.js';
import { loadWindow } from './context-window.js';

const unsupported = new Set(); // session ids whose CLI answered "Unsupported control request"

/** Stores a reading; null (no process running) or a broken answer removes it, so the estimate from items is used. */
export function rememberUsage(sessionId, usage) {
  if (usage && Number.isFinite(usage.totalTokens)) state.context.set(sessionId, usage);
  else state.context.delete(sessionId);
}

/**
 * @param {string} sessionId @param {{ifRunning?:boolean}} [options] ifRunning false: the panel may start the CLI
 * @returns {Promise<{usage:object|null, note:string|null}>} note: why there is no reading (shown muted, never as an error)
 */
export async function readUsage(sessionId, { ifRunning = true } = {}) {
  if (unsupported.has(sessionId)) return { usage: null, note: 'Claude Code המותקן לא מוסר פירוט של ההקשר.' };
  try {
    const usage = await api.control({ sessionId }, 'get_context_usage', { ifRunning });
    rememberUsage(sessionId, usage);
    return { usage: state.context.get(sessionId) || null, note: usage ? null : 'Claude Code של הסשן לא פעיל כרגע.' };
  } catch (error) {
    if (isUnsupported(error)) unsupported.add(sessionId);
    state.context.delete(sessionId);
    return { usage: null, note: isUnsupported(error) ? 'Claude Code המותקן לא מוסר פירוט של ההקשר.' : error.message };
  }
}

/** After a turn end, a divider, command output or a rewind: read again (in the background) and redraw. */
export function refreshContext(sessionId, redraw) {
  readUsage(sessionId).then(redraw);
}

/** Both halves at once (the CLI's reading and the real window), for views that show a full report. */
export async function loadContext(session, options) {
  const [reading] = await Promise.all([readUsage(session.id, options), loadWindow(session)]);
  return reading;
}
