/**
 * Pushes the session folder's current branch. Never forces, never pulls, takes no option from the request (only the
 * boolean "set the upstream"): the branch name comes from git. A credential prompt cannot hang the server (no terminal
 * prompt, a Git Credential Manager window is switched off, and a timeout kills git).
 */
const { git } = require('./run');
const { httpError } = require('../http-utils');
const { commitStatus } = require('./commit-status');
const { withRepoLock } = require('./repo-lock');

const PUSH_TIMEOUT_MS = 60 * 1000;
const MAX_OUTPUT = 1500;
const REJECTED = /non-fast-forward|fetch first|\[rejected\]|failed to push some refs|tip of your current branch is behind/i;

/** Git's output without the user:token part of any remote URL in it. */
const redact = text => String(text || '').replace(/\/\/[^/@\s]+@/g, '//***@');
const trimOutput = text => (redact(text).trim().length > MAX_OUTPUT ? `${redact(text).trim().slice(0, MAX_OUTPUT)}…` : redact(text).trim());

/** Hebrew reason for a failed push, with git's own words after it. */
function pushFailure({ stderr, timedOut }) {
  if (timedOut) return `הדחיפה לא הסתיימה תוך ${PUSH_TIMEOUT_MS / 1000} שניות ובוטלה (אולי נדרשת התחברות ל-remote). ${trimOutput(stderr)}`.trim();
  if (REJECTED.test(stderr)) {
    return `הדחיפה נדחתה: ב-remote יש שינויים שאין אצלך. בצע pull (או rebase) בטרמינל ונסה שוב; ה-GUI לא מושך שינויים ולא דוחף בכוח.\n${trimOutput(stderr)}`;
  }
  return `הדחיפה נכשלה:\n${trimOutput(stderr)}`;
}

/**
 * Pushes an already-located repository (the caller holds the repository lock).
 * @param {string} root @param {{setUpstream?:boolean}} [options] setUpstream: `git push -u origin <branch>` for a branch without upstream
 * @returns {Promise<{ok:true, output:string, setUpstream:boolean}>}
 * @throws httpError 409 with a Hebrew reason
 */
async function pushLocked(root, { setUpstream = false } = {}) {
  const status = await commitStatus({ cwd: root });
  if (!status.isRepo) throw httpError(400, 'התיקייה אינה מאגר git');
  if (status.inProgress || status.detached || !status.hasCommits) throw httpError(409, status.pushReason);
  let args;
  if (status.upstream) args = ['push'];
  else if (setUpstream === true && status.canPushNewUpstream) args = ['push', '-u', 'origin', status.branch];
  else throw httpError(409, status.pushReason || 'לענף אין upstream.');
  const result = await git(root, args, { timeoutMs: PUSH_TIMEOUT_MS, env: { GCM_INTERACTIVE: 'never' } });
  if (!result.ok) throw httpError(409, pushFailure(result));
  return { ok: true, output: trimOutput(`${result.stdout}\n${result.stderr}`), setUpstream: args.includes('-u') };
}

/**
 * @param {{cwd:string, archived?:boolean}} session a runnable session
 * @param {{setUpstream?:boolean}} [request]
 * @returns {Promise<{ok:true, output:string, setUpstream:boolean}>}
 * @throws httpError 400/409 (409: busy, refused by the state of the repository, rejected, timed out)
 * @example await pushBranch(session, { setUpstream: true })
 */
async function pushBranch(session, request = {}) {
  if (session.archived) throw httpError(409, 'הסשן בארכיון.');
  const top = await git(session.cwd, ['rev-parse', '--show-toplevel']);
  if (!top.ok) throw httpError(400, 'התיקייה אינה מאגר git');
  const root = top.stdout.trim();
  return withRepoLock(root, () => pushLocked(root, { setUpstream: request?.setUpstream === true }));
}

module.exports = { pushBranch, pushLocked, PUSH_TIMEOUT_MS, redact };
