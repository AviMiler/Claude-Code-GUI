/**
 * Reverts one hunk of the Changes pane in the working tree. The browser sends only the file's repository-relative path,
 * the hunk's index and its fingerprint; the diff and the patch are made here, from the same diff the pane shows
 * (session-diff.js, parsed by the pane's own diff-parse.js), and applied with `git apply -R` (check first).
 */
const fs = require('fs');
const path = require('path');
const { git } = require('./run');
const { sessionDiff } = require('./session-diff');
const { paneCode, fileSections } = require('./diff-sections');
const { httpError } = require('../http-utils');
const { realOrNull, resolveInside, refuseWrite } = require('../files/safe-path');

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;
const STALE = 'הקובץ השתנה מאז שהוצג. רענן את חלונית השינויים ונסה שוב.';
const WHOLE_FILE = 'אפשר לבטל את כל הקובץ: "ביטול השינויים בקובץ" בכותרת הקובץ.';

/** A section's header lines (mode changes left out: only content is reverted) and its hunks' raw lines. */
function splitHunks(lines) {
  const header = [];
  const hunks = [];
  for (const line of lines) {
    if (HUNK_HEADER.test(line)) hunks.push([line]);
    else if (hunks.length) hunks.at(-1).push(line);
    else if (!/^(old|new) mode /.test(line)) header.push(line);
  }
  // The diff's last line ends with "\n", which leaves an empty piece after the split.
  const last = hunks.at(-1);
  while (last && last.at(-1) === '') last.pop();
  return { header, hunks };
}

/** The file's real path for the write rules; a deleted file is checked through its nearest existing folder. */
function checkWritable(root, relative) {
  let probe = path.join(root, relative);
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  const real = resolveInside([realOrNull(root)].filter(Boolean), root, probe);
  refuseWrite(path.join(real, path.relative(probe, path.join(root, relative))));
}

/**
 * @param {{cwd:string, archived?:boolean}} session a runnable session (its folder exists)
 * @param {{path:string, index:number, hash:string}} request path: as the pane shows it (relative to the repository's top)
 * @returns {Promise<{ok:true, path:string}>}
 * @throws httpError 400/403/409 with a Hebrew reason (409: the hunk changed since it was shown, or git refused the patch)
 * @example await revertHunk(session, { path: 'src/app.js', index: 1, hash: '1a2b3c4d5e6f7' })
 */
async function revertHunk(session, { path: relative, index, hash } = {}) {
  if (session.archived) throw httpError(409, 'הסשן בארכיון. שחזר אותו כדי לבטל שינויים.');
  if (typeof relative !== 'string' || !relative || !Number.isInteger(index) || index < 0 || typeof hash !== 'string') {
    throw httpError(400, 'בקשה לא תקינה לביטול שינוי');
  }
  const result = await sessionDiff({ cwd: session.cwd });
  if (!result.isRepo) throw httpError(400, 'התיקייה אינה מאגר git');
  const { root } = result;
  if (!(await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])).ok) {
    throw httpError(409, 'במאגר עדיין אין commit, ולכן אין גרסה שאפשר לחזור אליה.');
  }
  const { parseDiff, hunkHash } = await paneCode();
  const sections = fileSections(result.diff);
  const matches = sections.map((lines, at) => ({ lines, at, file: parseDiff(lines.join('\n'))[0] }))
    .filter(entry => entry.file?.path === relative);
  if (matches.length !== 1) throw httpError(409, STALE);
  const [{ lines, at, file }] = matches;
  if (file.binary) throw httpError(409, 'אי אפשר לבטל שינוי בקובץ בינארי.');
  if (file.status === 'renamed' || file.oldPath) throw httpError(409, `אי אפשר לבטל חלק משינוי שם של קובץ. ${WHOLE_FILE}`);
  if (!file.hunks.length) throw httpError(409, 'בקובץ אין שינויי תוכן (רק הרשאות או קובץ ריק).');
  if (result.truncated && at === sections.length - 1) throw httpError(409, 'השינויים בקובץ הזה לא מוצגים במלואם, ולכן אי אפשר לבטל אותם מכאן.');
  const tracked = await git(root, ['--literal-pathspecs', 'ls-files', '--error-unmatch', '--', relative]);
  if (!tracked.ok) throw httpError(409, `קובץ חדש שלא נוסף ל-git – אין גרסה קודמת לחזור אליה. ${WHOLE_FILE}`);
  const staged = await git(root, ['--literal-pathspecs', 'diff', '--cached', '--name-only', '-z', '--', relative]);
  if (!staged.ok || staged.stdout) throw httpError(409, `לקובץ יש שינויים ב-stage (git add), ולכן אי אפשר לבטל חלק אחד שלו. ${WHOLE_FILE}`);
  const hunk = file.hunks[index];
  if (!hunk || hunkHash(hunk) !== hash) throw httpError(409, STALE);
  checkWritable(root, relative);
  const { header, hunks } = splitHunks(lines);
  const patch = `${[...header, ...hunks[index]].join('\n')}\n`;
  const apply = ['apply', '-R', '--whitespace=nowarn', '-'];
  const check = await git(root, [...apply.slice(0, 2), '--check', ...apply.slice(2)], { input: patch });
  if (!check.ok) throw httpError(409, `git לא הצליח לבטל את השינוי: ${check.stderr.trim()}`);
  const applied = await git(root, apply, { input: patch });
  if (!applied.ok) throw httpError(409, `git לא הצליח לבטל את השינוי: ${applied.stderr.trim()}`);
  return { ok: true, path: relative };
}

module.exports = { revertHunk };
