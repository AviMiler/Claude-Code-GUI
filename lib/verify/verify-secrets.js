/**
 * The per-process secret of the Stop hook (verify loop). Each CLI process start gets a new random secret, handed to the
 * process in its environment (never on the command line); the hook script sends it back, so only that process's hook
 * can call the verify-hook route. Keyed by the id the process was started under: a warmed spare starts as "spare-…" and
 * is later given to a real session (alias).
 */
const crypto = require('crypto');

const ENV_NAME = 'CLAUDE_GUI_VERIFY_SECRET';
const entries = new Map(); // process key (the id in the hook's argv) -> { secret, sessionId }

/** A new secret for a process about to start. @param {string} key @returns {string} */
function issue(key) {
  const secret = crypto.randomBytes(24).toString('hex');
  entries.set(key, { secret, sessionId: key });
  return secret;
}

/** @param {string} key @returns {object} environment variables for that process ({} when none was issued) */
const envFor = key => (entries.has(key) ? { [ENV_NAME]: entries.get(key).secret } : {});

/** A warmed spare became a session: its hook still says the spare's id. */
function alias(key, sessionId) {
  const entry = entries.get(key);
  if (entry) entry.sessionId = sessionId;
}

/** @param {string} key @param {string} secret @returns {string|null} the session the caller belongs to, or null for a wrong secret */
function resolve(key, secret) {
  const entry = entries.get(key);
  if (!entry || typeof secret !== 'string') return null;
  const a = Buffer.from(entry.secret);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? entry.sessionId : null;
}

module.exports = { ENV_NAME, issue, envFor, alias, resolve };
