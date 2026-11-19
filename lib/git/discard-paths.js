/**
 * The write rules for "ביטול השינויים בקובץ" on one repository path, before git restores or deletes it: never a link
 * (the file itself or a folder on the way), never anything but a regular file, never under .git, never the GUI's own
 * data or config.json (also as a hard link), never Claude's own settings files (.mcp.json, .claude/settings*.json).
 */
const fs = require('fs');
const path = require('path');
const { httpError } = require('../http-utils');
const { git } = require('./run');
const { realOrNull, isInside, refuseWrite, refuseViewOnly } = require('../files/safe-path');

const samePath = (a, b) => isInside(a, b) && isInside(b, a);

/** A repository path as git prints it: relative, no "." / ".." / empty segment, no NUL. */
function refuseOddPath(relative) {
  const parts = relative.split('/');
  if (path.isAbsolute(relative) || /^[a-z]:/i.test(relative) || relative.includes('\0') || relative.includes('\\')
    || parts.some(part => part === '' || part === '.' || part === '..')) throw httpError(400, 'נתיב קובץ לא תקין');
}

/** Refuses a symlink or a submodule as git records it, in the index or in HEAD. */
async function refuseLinkModes(root, relative) {
  const listed = await Promise.all([
    git(root, ['--literal-pathspecs', 'ls-files', '-s', '-z', '--', relative]),
    git(root, ['--literal-pathspecs', 'ls-tree', '-z', 'HEAD', '--', relative]),
  ]);
  const modes = listed.flatMap(result => result.stdout.split('\0').filter(Boolean).map(line => line.split(' ')[0]));
  if (modes.some(mode => mode === '160000')) throw httpError(409, `${relative} הוא submodule. בטל את השינויים בו מתוך המאגר שלו.`);
  if (modes.some(mode => mode === '120000')) throw httpError(409, `${relative} הוא קישור סימבולי. קישורים לא מבוטלים מכאן.`);
}

/**
 * The path on disk (missing: its nearest existing folder) must be where the repository says, with no link on the way;
 * then the write rules of safe-path.js apply to it.
 */
function refuseOnDisk(root, realRoot, relative) {
  const full = path.join(root, relative);
  let stat = null;
  try { stat = fs.lstatSync(full); } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw httpError(409, `אי אפשר לקרוא את ${relative}: ${error.message}`);
  }
  if (stat?.isSymbolicLink()) throw httpError(409, `${relative} הוא קישור סימבולי. קישורים לא מבוטלים מכאן.`);
  if (stat && !stat.isFile()) throw httpError(409, `${relative} אינו קובץ רגיל.`);
  let probe = full;
  while (!stat && !fs.existsSync(probe) && probe !== root) probe = path.dirname(probe);
  const real = realOrNull(probe);
  if (!real || !samePath(real, path.join(realRoot, path.relative(root, probe)))) {
    throw httpError(409, `בדרך אל ${relative} יש קישור או תיקייה שמובילה למקום אחר. הקובץ לא שונה.`);
  }
  const target = path.join(real, path.relative(probe, full));
  refuseWrite(target);
  refuseViewOnly(target);
}

/**
 * @param {string} gitRoot the repository's top folder @param {string[]} relatives the paths the discard will write
 * @returns {Promise<void>}
 * @throws httpError 400 (odd path), 403 (write rules), 409 (link, submodule, not a regular file)
 */
async function checkDiscardPaths(gitRoot, relatives) {
  const root = path.resolve(gitRoot); // git prints C:/x on Windows
  const realRoot = realOrNull(root);
  if (!realRoot) throw httpError(409, `תיקיית המאגר לא קיימת: ${root}`);
  for (const relative of relatives) {
    refuseOddPath(relative);
    await refuseLinkModes(root, relative);
    refuseOnDisk(root, realRoot, relative);
  }
}

module.exports = { checkDiscardPaths };
