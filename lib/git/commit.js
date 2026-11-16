/**
 * The Changes pane's commit: stages exactly the files the user ticked and commits them (optionally pushing after).
 * Safety rules: the folder is the session's; every path must be in the repository's own current status list (so no
 * absolute path, no `..`, no pathspec magic: `--literal-pathspecs` and `--`); the message goes in on stdin (`-F -`), never
 * on the command line; hooks run normally (no --no-verify), nothing is amended, forced or taken from the request as an option.
 */
const { git } = require('./run');
const { httpError } = require('../http-utils');
const { commitStatus } = require('./commit-status');
const { withRepoLock } = require('./repo-lock');
const { pushLocked } = require('./push');

const MAX_MESSAGE_CHARS = 10000;
const MAX_OUTPUT = 1500;
const COMMIT_TIMEOUT_MS = 120 * 1000; // a pre-commit hook may run tests
const ADD_CHUNK = 200; // paths per `git add`: a long Windows command line is refused

const tail = text => (text.trim().length > MAX_OUTPUT ? `…${text.trim().slice(-MAX_OUTPUT)}` : text.trim());

/** The trimmed message, or a 400 for an empty / over-long / non-text one. */
function checkMessage(message) {
  if (typeof message !== 'string' || !message.trim()) throw httpError(400, 'הודעת ה-commit ריקה.');
  if (message.length > MAX_MESSAGE_CHARS) throw httpError(400, `הודעת ה-commit ארוכה מדי (עד ${MAX_MESSAGE_CHARS} תווים).`);
  if (message.includes('\0')) throw httpError(400, 'הודעת ה-commit מכילה תו לא תקין.');
  return `${message.replace(/\r\n/g, '\n').trim()}\n`;
}

/** The status entries for the chosen paths; every path must be one of the repository's own changed files. */
function chooseFiles(status, paths) {
  if (!Array.isArray(paths) || !paths.length || paths.some(item => typeof item !== 'string')) throw httpError(400, 'לא נבחרו קבצים לשמירה.');
  const byPath = new Map(status.files.map(file => [file.path, file]));
  const chosen = [...new Set(paths)].map(item => {
    const file = byPath.get(item);
    if (!file) throw httpError(400, `הקובץ אינו ברשימת השינויים (אולי השתנה מאז שהוצג): ${item}`);
    return file;
  });
  // The index may hold staged changes of files not ticked; they would be committed too, so refuse instead of unstaging them.
  const covered = new Set(chosen.flatMap(file => [file.path, file.oldPath].filter(Boolean)));
  const stray = status.files.filter(file => file.staged && !covered.has(file.path) && !covered.has(file.oldPath));
  if (stray.length) {
    throw httpError(409, `לקבצים שלא סומנו יש שינויים ב-stage (git add), והם היו נכנסים ל-commit: ${stray.slice(0, 5).map(file => file.path).join(', ')}. סמן אותם או בטל את ה-stage.`);
  }
  return chosen;
}

/** `git add` for the chosen files that have something unstaged (new, modified or deleted in the working tree). */
async function stage(root, chosen) {
  const toAdd = chosen.filter(file => file.untracked || file.y !== ' ').map(file => file.path);
  for (let at = 0; at < toAdd.length; at += ADD_CHUNK) {
    const added = await git(root, ['--literal-pathspecs', 'add', '--', ...toAdd.slice(at, at + ADD_CHUNK)]);
    if (!added.ok) throw httpError(409, `git add נכשל:\n${tail(added.stderr)}\nחלק מהקבצים אולי כבר ב-stage.`);
  }
  if ((await git(root, ['diff', '--cached', '--quiet'])).ok) throw httpError(409, 'אין שינויים ב-stage לשמירה (הקבצים שנבחרו זהים ל-HEAD).');
}

/**
 * @param {{cwd:string, archived?:boolean}} session a runnable session
 * @param {{message:string, paths:string[], push?:boolean, setUpstream?:boolean}} request paths: as the commit box lists them
 *   (repository-relative); push / setUpstream: booleans only
 * @returns {Promise<{ok:true, hash:string, branch:string|null, pushed:boolean, pushOutput?:string, pushError?:string}>} a push that
 *   failed after a good commit is reported in pushError (the commit stays)
 * @throws httpError 400/409 with a Hebrew reason; a failed commit (hook, identity) carries git's text and leaves the index as git left it
 * @example await commitChanges(session, { message: 'Fix login\n\nBody', paths: ['src/a.js'], push: true })
 */
async function commitChanges(session, request = {}) {
  if (session.archived) throw httpError(409, 'הסשן בארכיון. שחזר אותו כדי לשמור שינויים.');
  const top = await git(session.cwd, ['rev-parse', '--show-toplevel']);
  if (!top.ok) throw httpError(400, 'התיקייה אינה מאגר git');
  const root = top.stdout.trim();
  const message = checkMessage(request?.message);
  return withRepoLock(root, async () => {
    const status = await commitStatus({ cwd: root });
    if (!status.isRepo) throw httpError(400, 'התיקייה אינה מאגר git');
    if (!status.canCommit) throw httpError(409, status.commitReason);
    await stage(root, chooseFiles(status, request.paths));
    const commit = await git(root, ['commit', '-F', '-'], { input: message, timeoutMs: COMMIT_TIMEOUT_MS });
    if (!commit.ok) {
      const why = commit.timedOut ? `לא הסתיים תוך ${COMMIT_TIMEOUT_MS / 1000} שניות ובוטל.` : '';
      throw httpError(409, `ה-commit נכשל (hook או הגדרת git). ${why}\n${tail(commit.stderr || commit.stdout)}\nה-index נשאר כפי ש-git השאיר אותו: הקבצים שנבחרו עשויים להיות כבר ב-stage.`);
    }
    const hash = (await git(root, ['rev-parse', '--short', 'HEAD'])).stdout.trim();
    const done = { ok: true, hash, branch: status.branch, pushed: false };
    if (request.push !== true) return done;
    try {
      const pushed = await pushLocked(root, { setUpstream: request.setUpstream === true });
      return { ...done, pushed: true, pushOutput: pushed.output, setUpstream: pushed.setUpstream };
    } catch (error) {
      return { ...done, pushError: error.message };
    }
  });
}

module.exports = { commitChanges, MAX_MESSAGE_CHARS };
