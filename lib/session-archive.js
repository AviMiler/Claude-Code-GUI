/**
 * Archiving a session (Claude Code Desktop): it leaves the session list but is kept, and a restore brings it back as it
 * was. Like Desktop, archiving removes the session's worktree when nothing in it is uncommitted; the branch stays.
 */
const store = require('./session-store');
const runtime = require('./session-runtime');
const { httpError } = require('./http-utils');
const { publish, requireSession } = require('./session-common');
const { stopRequested } = require('./session-messages');
const { removeWorktree } = require('./git/worktree-remove');
const { restoreWorktree } = require('./git/worktree');
const { stopRun } = require('./terminal/shell-runs');

/** Another session that is not archived (a fork) works in the same worktree: its folder stays. */
const worktreeInUse = session => store.list()
  .some(other => other.id !== session.id && !other.archived && other.worktree?.path === session.worktree.path);

/**
 * Stops a running turn (queued messages stay, paused, for after a restore), closes the CLI process, unpins the session
 * and removes its worktree when git agrees (no uncommitted changes).
 * @returns {Promise<{worktreeRemoved:boolean, worktreeError?:string}>} worktreeError: why the worktree folder stayed
 */
async function archiveSession(id) {
  const session = requireSession(id);
  if (session.archived) return { worktreeRemoved: false };
  // Archived before the stop: the stopped turn's end must not send the next queued message (dispatchNext).
  publish(store.update(id, { archived: true, archivedAt: Date.now(), pinned: false }));
  if (session.status === 'running') {
    stopRequested.add(id);
    // No turn to interrupt (the CLI was still starting): a leftover mark would call a later failure "stopped".
    if (!await runtime.interrupt(id)) stopRequested.delete(id);
  }
  runtime.close(id);
  stopRun(id); // the worktree may be removed below
  if (!session.worktree || worktreeInUse(session)) return { worktreeRemoved: false };
  const result = await removeWorktree(session.worktree);
  return { worktreeRemoved: result.removed, ...(result.error && { worktreeError: result.error }) };
}

/** Brings a session back to the list; a worktree that archiving removed is checked out again first. */
async function unarchiveSession(id) {
  const session = requireSession(id);
  if (!session.archived) return { ok: true };
  if (session.worktree) await restoreWorktree(session.worktree).catch(error => { throw httpError(400, error.message); });
  publish(store.update(id, { archived: false, archivedAt: null }));
  return { ok: true };
}

/** A message to an archived session (from any composer) restores it first, then is sent as usual. */
async function restoreForMessage(id) {
  if (requireSession(id).archived) await unarchiveSession(id);
}

module.exports = { archiveSession, unarchiveSession, restoreForMessage };
