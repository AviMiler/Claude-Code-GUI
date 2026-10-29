/**
 * Background tasks of each session (shell commands, subagents, Monitor), kept in memory from the CLI's task events.
 * Not persisted: tasks live inside the CLI process and end with it.
 */

const MAX_TASKS_PER_SESSION = 50;
const tasksBySession = new Map(); // app session id -> Map(task id -> task)

const defined = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));

/**
 * Applies one task event (from event-translator readTaskEvent).
 * @param {string} sessionId
 * @param {{id:string, phase:'started'|'progress'|'ended', fields:object}} update
 * @returns {object[]} the session's tasks after the update
 */
function apply(sessionId, update) {
  if (!tasksBySession.has(sessionId)) tasksBySession.set(sessionId, new Map());
  const tasks = tasksBySession.get(sessionId);
  const now = Date.now();
  const fresh = { id: update.id, status: 'running', startedAt: now };
  // A 'started' event is a new task even if the id was seen before (a restarted CLI may reuse ids).
  const existing = update.phase === 'started' ? fresh : tasks.get(update.id) || fresh;
  const task = { ...existing, ...defined(update.fields), updatedAt: now };
  if (update.phase === 'ended') task.endedAt = now;
  tasks.set(update.id, task);
  // Keep the newest; finished ones go first when the list is full.
  if (tasks.size > MAX_TASKS_PER_SESSION) {
    const oldest = [...tasks.values()].filter(item => item.status !== 'running').sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (oldest) tasks.delete(oldest.id);
  }
  return list(sessionId);
}

/** @returns {object[]} tasks of a session, newest first */
function list(sessionId) {
  return [...(tasksBySession.get(sessionId)?.values() || [])].sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Marks every running task as ended (the CLI process exited, so they cannot still run).
 * @returns {boolean} true when something changed
 */
function endAll(sessionId) {
  const running = list(sessionId).filter(task => task.status === 'running');
  running.forEach(task => apply(sessionId, { id: task.id, phase: 'ended', fields: { status: 'killed', summary: task.summary || 'התהליך של Claude Code נסגר' } }));
  return running.length > 0;
}

/** Forgets a session's tasks (session deleted). */
function forget(sessionId) {
  tasksBySession.delete(sessionId);
}

module.exports = { apply, list, endAll, forget };
