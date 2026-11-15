/**
 * Live state of the verify loop per session, in memory only: failed attempts in the current turn (the server's
 * counter is the cap, not the hook's stop_hook_active) and `verifying` ({ attempt, max } while a check runs, shown in
 * the session's meta by session-common.toMeta; the stall warning reads it too).
 */
const attempts = new Map(); // sessionId -> failed checks in this turn
const running = new Map(); // sessionId -> { attempt, max }

const failures = id => attempts.get(id) || 0;
const addFailure = id => { attempts.set(id, failures(id) + 1); return failures(id); };
/** A turn ended without a block (or the session is gone): the count starts over. */
const resetAttempts = id => attempts.delete(id);

/** @returns {{attempt:number, max:number}|null} */
const verifying = id => running.get(id) || null;
const setVerifying = (id, value) => (value ? running.set(id, value) : running.delete(id));

module.exports = { failures, addFailure, resetAttempts, verifying, setVerifying };
