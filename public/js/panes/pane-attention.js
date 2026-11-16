/**
 * Which pane entries the top bar offers and which carry a "new" dot. Plan and Background tasks are offered only while the
 * session has something to show there (a plan or todo list; a background task) or their tab is open. Content that first
 * appears during a turn puts a small dot on the entry until the pane is shown; nothing opens by itself. Browser memory only.
 */
import { planState } from '../plan/plan-source.js';

const CONDITIONAL = ['plan', 'tasks'];
const seen = new Map(); // sessionId -> { plan, tasks }: whether each had content at the last look
const dots = new Map(); // sessionId -> Set of pane ids
const planCache = new WeakMap(); // items array -> { key, has }: planState scans the items, so not on every refresh

function hasPlan(session) {
  const items = session.items || [];
  const key = `${items.length}|${(session.pendingPermissions || []).length}`;
  const cached = planCache.get(items);
  if (cached?.key === key) return cached.has;
  const state = planState(session);
  const has = Boolean(state.plan || state.todos?.length);
  if (session.items) planCache.set(items, { key, has });
  return has;
}

/**
 * @param {string} id a pane id
 * @param {object} session
 * @returns {boolean} the pane has something to show for the session (always true for the other panes)
 */
export function hasContent(id, session) {
  if (id === 'tasks') return (session.tasks || []).length > 0;
  if (id === 'plan') return hasPlan(session);
  return true;
}

/**
 * Compares the session's content with the last look and marks the entries whose content just appeared during a turn.
 * A session whose items are not loaded yet is not looked at (its plan would seem to appear when they arrive).
 * @param {object} session
 */
export function noteContent(session) {
  if (!session?.itemsRev) return;
  const before = seen.get(session.id);
  const now = {};
  for (const id of CONDITIONAL) {
    now[id] = hasContent(id, session);
    if (before && !before[id] && now[id] && session.status === 'running') {
      markDot(session.id, id);
    }
  }
  seen.set(session.id, now);
}

/** Puts the dot on a pane's entry (the side question's answer arrived while its tab was not shown). */
export function markDot(sessionId, id) {
  if (!dots.has(sessionId)) dots.set(sessionId, new Set());
  dots.get(sessionId).add(id);
}

/** @returns {boolean} the entry of this pane carries the dot */
export const hasDot = (sessionId, id) => Boolean(dots.get(sessionId)?.has(id));

/** The pane was shown: its dot goes. */
export function clearDot(sessionId, id) { dots.get(sessionId)?.delete(id); }
