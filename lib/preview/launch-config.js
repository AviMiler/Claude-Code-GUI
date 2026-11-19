/**
 * Reads `<session folder>/.claude/launch.json` (the folder comes from the stored session, never from a request):
 * no symlink or junction at `.claude` or at the file, a regular file whose real path stays inside the folder, a size cap,
 * then the strict validation of launch-validate.js. Each configuration gets a hash of exactly what the confirmation
 * shows, so a start can be refused when the file changed after it was shown.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isInside, realOrNull, readRefusal } = require('../files/safe-path');
const { needsShell } = require('../spawn-utils');
const { validateLaunch, LaunchError } = require('./launch-validate');
const { resolveProgram } = require('./dev-resolve');

const MAX_LAUNCH_BYTES = 64 * 1024;
const RELATIVE = path.join('.claude', 'launch.json');

const lstatOrNull = target => { try { return fs.lstatSync(target); } catch { return null; } };

/** @returns {string} the hash of one validated configuration (what the user confirms) */
function hashOf(entry) {
  const shown = [entry.name, entry.executable, entry.program, entry.args, entry.cwd, entry.port, entry.url, Object.entries(entry.env).sort()];
  return crypto.createHash('sha256').update(JSON.stringify(shown)).digest('hex');
}

/**
 * Adds `program`, the full path that will run (dev-resolve.js). A program that runs through cmd.exe (a .cmd / .bat on
 * Windows) may not get a `"` in an argument: cmd.exe and the program's own parser disagree on it, so one argument could
 * become several (e.g. an injected --inspect=0.0.0.0:9229). Throws LaunchError.
 */
function withProgram(entry, root) {
  const found = resolveProgram(entry.executable, { root, cwd: entry.cwd });
  if (found.error) throw new LaunchError(`"${entry.name}": ${found.error}`);
  if (needsShell(found.program) && /["%]/.test(found.program)) {
    throw new LaunchError(`"${entry.name}": הנתיב המלא של התוכנה מכיל " או % ולכן אי אפשר להריץ אותו דרך cmd.exe`);
  }
  if (needsShell(found.program) && entry.args.some(arg => arg.includes('"'))) {
    throw new LaunchError(`"${entry.name}": התו " לא נתמך בארגומנטים כשהתוכנה היא קובץ ${path.extname(found.program) || 'אצווה'} (רץ דרך cmd.exe)`);
  }
  return { ...entry, program: found.program };
}

/** The file's text, or throws LaunchError. @param {string} root real path of the session folder @returns {string|null} null: no file */
function readLaunchText(root) {
  const folder = path.join(root, '.claude');
  const file = path.join(root, RELATIVE);
  const folderStat = lstatOrNull(folder);
  if (!folderStat) return null;
  if (folderStat.isSymbolicLink() || !folderStat.isDirectory()) throw new LaunchError('התיקייה .claude היא קישור או לא תיקייה; הקובץ לא נקרא');
  const stat = lstatOrNull(file);
  if (!stat) return null;
  if (stat.isSymbolicLink()) throw new LaunchError('launch.json הוא קישור (symlink); הקובץ לא נקרא');
  if (!stat.isFile()) throw new LaunchError('launch.json אינו קובץ רגיל');
  const real = realOrNull(file);
  if (!real || !isInside(real, root)) throw new LaunchError('launch.json מחוץ לתיקיית הסשן');
  const refusal = readRefusal(real); // a hard link of the GUI's own data or config (like the file viewer)
  if (refusal) throw new LaunchError(refusal);
  if (stat.size > MAX_LAUNCH_BYTES) throw new LaunchError(`launch.json גדול מדי (עד ${MAX_LAUNCH_BYTES / 1024} KB)`);
  const buffer = fs.readFileSync(real);
  if (buffer.length > MAX_LAUNCH_BYTES) throw new LaunchError(`launch.json גדול מדי (עד ${MAX_LAUNCH_BYTES / 1024} KB)`);
  return buffer.toString('utf8').replace(/^﻿/, '');
}

/**
 * @param {{cwd:string}} session from the store @param {number} guiPort the GUI's own port (refused for a dev server)
 * @returns {{file:string, exists:boolean, error:string|null, configurations:object[]}} each configuration has `hash`;
 *   error: why the file is refused (Hebrew), then configurations is empty
 */
function loadLaunch(session, guiPort) {
  const root = realOrNull(session.cwd);
  const file = path.join(session.cwd, RELATIVE);
  if (!root) return { file, exists: false, error: 'תיקיית הסשן לא קיימת', configurations: [] };
  try {
    const text = readLaunchText(root);
    if (text === null) return { file, exists: false, error: null, configurations: [] };
    let raw;
    try { raw = JSON.parse(text); } catch (error) { throw new LaunchError(`launch.json אינו JSON תקין: ${error.message}`); }
    const configurations = validateLaunch(raw, root, guiPort).map(entry => withProgram(entry, root))
      .map(entry => ({ ...entry, hash: hashOf(entry) }));
    return { file, exists: true, error: null, configurations };
  } catch (error) {
    if (!(error instanceof LaunchError)) throw error;
    return { file, exists: true, error: error.message, configurations: [] };
  }
}

module.exports = { loadLaunch, hashOf, MAX_LAUNCH_BYTES };
