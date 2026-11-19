/**
 * "ביטול השינויים בקובץ" in the Changes pane: brings ONE file back to HEAD, staged and unstaged changes alike, or deletes
 * it when it is new. The request names the file only ({ path, status, diffHash } as the pane got them from
 * discard-states.js); the folder is the session's own, every check is made again here, and every git call takes the
 * path after `--` with literal pathspecs. Runs under the repository's lock, like commit and merge.
 */
const fs = require('fs');
const path = require('path');
const { git } = require('./run');
const { httpError } = require('../http-utils');
const { withRepoLock } = require('./repo-lock');
const { sessionDiff } = require('./session-diff');
const { fileHashes } = require('./diff-sections');
const { operationInProgress } = require('./commit-status');
const { statusEntries, entryFor, codeOf } = require('./discard-states');
const { checkDiscardPaths } = require('./discard-paths');

const TIMEOUT_MS = 30 * 1000;
const STALE = 'הקובץ השתנה מאז שהוצג. רענן את החלונית ונסה שוב.';
const NO_HEAD = 'במאגר עדיין אין commit, ולכן אין גרסה שאפשר לחזור אליה.';
const LOCKED = /permission denied|access is denied|unable to unlink|being used by another process|read-only|resource busy/i;

/** A failed write as a Hebrew reason; a locked or read-only file (Windows) says so and keeps the OS's own words. */
function failure(text, timedOut) {
  const detail = text.trim().slice(0, 800);
  if (timedOut) return httpError(409, `git לא סיים תוך ${TIMEOUT_MS / 1000} שניות. בדוק את מצב הקובץ (git status).`);
  if (LOCKED.test(detail)) return httpError(409, `הקובץ נעול או מוגדר לקריאה בלבד (אולי תוכנה אחרת מחזיקה אותו): ${detail}`);
  return httpError(409, `git לא הצליח לבטל את השינויים בקובץ: ${detail}`);
}

async function run(root, args) {
  const result = await git(root, ['--literal-pathspecs', ...args], { timeoutMs: TIMEOUT_MS });
  if (!result.ok) throw failure(result.stderr, result.timedOut);
}

const restore = (root, relative) => run(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', relative]);
const remove = (root, relative) => run(root, ['rm', '-q', '-f', '--', relative]); // unstage and delete a new file

/** An untracked file must be one the pane listed (ls-files --others): never a folder git folded into "dir/". */
async function deleteUntracked(root, relative) {
  const listed = await git(root, ['--literal-pathspecs', 'ls-files', '--others', '--exclude-standard', '-z', '--', relative]);
  if (!listed.stdout.split('\0').includes(relative)) throw httpError(409, STALE);
  try { fs.unlinkSync(path.join(root, relative)); } catch (error) {
    throw (['EPERM', 'EACCES', 'EBUSY'].includes(error.code) ? httpError(409, `הקובץ נעול או מוגדר לקריאה בלבד (אולי תוכנה אחרת מחזיקה אותו): ${error.message}`)
      : httpError(409, `מחיקת הקובץ נכשלה: ${error.message}`));
  }
}

/** What to do for a status entry, and the paths it writes. */
function planFor(entry, hasHead) {
  const { x, y } = entry;
  if (x === '?') return { kind: 'untracked', paths: [entry.path] };
  if (x === 'A' || y === 'A' || x === 'C') return { kind: 'added', paths: [entry.path] };
  if (!hasHead) throw httpError(409, NO_HEAD);
  if (x === 'R' || y === 'R') return { kind: 'renamed', paths: [entry.path, entry.oldPath] };
  return { kind: 'restore', paths: [entry.path] };
}

/**
 * @param {{cwd:string, archived?:boolean}} session a runnable session (its folder exists)
 * @param {{path:string, status:string, diffHash:string}} request path: as the pane shows it; status and diffHash: the
 *   pane's fileStates entry for it
 * @returns {Promise<{ok:true, path:string, kind:'restore'|'added'|'renamed'|'untracked'}>}
 * @throws httpError 400/403/409 with a Hebrew reason (409 "הקובץ השתנה מאז שהוצג…" when status or diff differ)
 * @example await discardFile(session, { path: 'src/app.js', status: ' M', diffHash: '3f78…' }) // { ok: true, kind: 'restore' }
 */
async function discardFile(session, { path: relative, status, diffHash } = {}) {
  if (session.archived) throw httpError(409, 'הסשן בארכיון. שחזר אותו כדי לבטל שינויים.');
  if (typeof relative !== 'string' || !relative || typeof status !== 'string' || typeof diffHash !== 'string') {
    throw httpError(400, 'בקשה לא תקינה לביטול השינויים בקובץ');
  }
  const top = await git(session.cwd, ['rev-parse', '--show-toplevel']);
  if (!top.ok) throw httpError(409, 'התיקייה אינה מאגר git');
  return withRepoLock(top.stdout.trim(), async () => {
    const result = await sessionDiff({ cwd: session.cwd });
    if (!result.isRepo) throw httpError(409, 'התיקייה אינה מאגר git');
    const { root } = result;
    const gitDir = await git(root, ['rev-parse', '--absolute-git-dir']);
    const operation = gitDir.ok ? operationInProgress(gitDir.stdout.trim()) : null;
    if (operation) throw httpError(409, `במאגר מתבצע ${operation}. סיים או בטל אותו לפני ביטול שינויים בקובץ.`);
    const { ok, entries } = await statusEntries(root);
    if (!ok) throw httpError(409, 'git status נכשל במאגר הזה.');
    const entry = entryFor(entries, relative);
    if (!entry) throw httpError(409, `${relative} כבר אינו ברשימת השינויים. רענן את החלונית.`);
    if (entry.conflict || entries.some(file => file.conflict && [entry.path, entry.oldPath].includes(file.path))) {
      throw httpError(409, 'הקובץ בקונפליקט. פתור את הקונפליקט קודם.');
    }
    const hash = (await fileHashes(result.diff)).get(relative);
    if (codeOf(entry) !== status || !hash || hash !== diffHash) throw httpError(409, STALE);
    const hasHead = (await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])).ok;
    const plan = planFor(entry, hasHead);
    await checkDiscardPaths(root, plan.paths);
    if (plan.kind === 'untracked') await deleteUntracked(root, entry.path);
    else if (plan.kind === 'added') await remove(root, entry.path);
    else if (plan.kind === 'restore') await restore(root, entry.path);
    else { // renamed: the new name goes like a new file, the old one comes back from HEAD
      await remove(root, entry.path);
      await restore(root, entry.oldPath).catch(error => {
        throw httpError(409, `${entry.path} נמחק, אבל השחזור של ${entry.oldPath} נכשל: ${error.message}`);
      });
    }
    return { ok: true, path: relative, kind: plan.kind };
  });
}

module.exports = { discardFile };
