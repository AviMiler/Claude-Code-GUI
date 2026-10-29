/** One rewind at a time per session, and no message sent into a session while it restarts. */
const busy = new Set();

const isRewinding = sessionId => busy.has(sessionId);

/** Runs `work` holding the session's lock. */
async function withLock(sessionId, work) {
  busy.add(sessionId);
  try { return await work(); } finally { busy.delete(sessionId); }
}

module.exports = { isRewinding, withLock };
