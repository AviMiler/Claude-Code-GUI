/**
 * What the Stop hook asks (stop-hook.js -> POST verify-hook): may Claude stop now? Runs the project's stored check
 * when the turn changed files; a failure blocks the stop with the output's tail (the CLI continues the SAME turn),
 * up to config.verifyMaxAttempts failed checks; then Claude is let stop and the user is told (an error item notifies).
 * Every doubt answers "allow": the hook must never trap the model.
 */
const fs = require('fs');
const store = require('../session-store');
const { publish, pushExtra } = require('../session-common');
const { stopRequested } = require('../session-messages');
const { projectFolder, getCheck } = require('./verify-store');
const state = require('./verify-state');
const { runCheck, isChecking } = require('./verify-runs');
const { editedThisTurn } = require('./turn-edits');
const { CHECK_TIMEOUT_MS } = require('./verify-hook-settings');

const REASON_CHARS = 4000;
const NOTICE_TAIL_CHARS = 4000;
const ALLOW = { decision: 'allow' };

/** The last `max` characters, with a note when something was cut. */
function tailOf(result, max) {
  const text = result.error ? `${result.output}\n${result.error}` : result.output;
  const timeout = result.timedOut ? `\n[timed out after ${CHECK_TIMEOUT_MS / 1000} s]` : '';
  const full = `${text.trimEnd()}${timeout}` || `(no output, exit code ${result.exitCode})`;
  return full.length > max || result.cut ? `[output cut: only the last ${Math.min(max, full.length)} characters]\n${full.slice(-max)}` : full;
}

function setVerifying(id, value) {
  state.setVerifying(id, value);
  if (store.get(id)) publish(store.get(id));
}

/**
 * @param {string} sessionId @param {{verifyMaxAttempts:number, env:object}} config
 * @returns {Promise<{decision:'allow'}|{decision:'block', reason:string}>}
 */
async function decide(sessionId, config) {
  const allow = () => { state.resetAttempts(sessionId); return ALLOW; };
  const session = store.get(sessionId);
  if (isChecking(sessionId)) return ALLOW; // a second call while one runs (should not happen): it decides nothing
  if (!session || session.archived || stopRequested.has(sessionId) || !fs.existsSync(session.cwd)) return allow();
  const check = getCheck(projectFolder(session));
  if (!check?.enabled || !editedThisTurn(session.items || []).length) return allow();
  const max = config.verifyMaxAttempts;
  const attempt = state.failures(sessionId) + 1;
  setVerifying(sessionId, { attempt, max });
  const result = await runCheck(sessionId, { command: check.command, shell: check.shell, cwd: session.cwd, env: { ...process.env, ...config.env }, timeoutMs: CHECK_TIMEOUT_MS });
  setVerifying(sessionId, null);
  const current = store.get(sessionId);
  if (result.stopped || !current || current.archived || stopRequested.has(sessionId)) return allow();
  if (result.passed) {
    if (attempt > 1) pushExtra(sessionId, { kind: 'notice', text: 'הבדיקה האוטומטית עברה' });
    return allow();
  }
  state.addFailure(sessionId);
  const verify = { tail: tailOf(result, NOTICE_TAIL_CHARS), exitCode: result.exitCode, attempt, max };
  if (attempt >= max) {
    pushExtra(sessionId, { kind: 'error', text: `הבדיקה האוטומטית נכשלה ${attempt} פעמים, Claude נעצר`, verify });
    return allow();
  }
  pushExtra(sessionId, { kind: 'notice', level: 'warning', text: `בדיקה אוטומטית נכשלה (ניסיון ${attempt}/${max}), Claude ממשיך לתקן`, verify });
  return { decision: 'block', reason: `The automatic check failed (attempt ${attempt}/${max}). Fix the problem. Output tail:\n${tailOf(result, REASON_CHARS)}` };
}

module.exports = { decide };
