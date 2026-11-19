/**
 * Which program a dev server configuration really runs, resolved on the server BEFORE the confirmation, so the dialog
 * shows (and the hash covers) the exact full path that is spawned. Why: on Windows a bare name (node, npm) started through
 * cmd.exe is searched in the current folder first, so a `node.cmd` planted in the project would run instead of Node.
 * A bare name is looked up only in the GUI's OWN PATH (never the configuration's env.PATH), in absolute local entries
 * outside the session folder ('.', relative, network and project entries are skipped), with PATHEXT on Windows.
 * A name with a folder part (`./node_modules/.bin/vite.cmd`, an absolute path) is taken literally, resolved against the
 * working folder; the dialog then shows that full path, inside the project or not.
 */
const fs = require('fs');
const path = require('path');
const { isInside, realOrNull } = require('../files/safe-path');

const WINDOWS = process.platform === 'win32';
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/** A UNC / network path (\\host\share, //host/share) or a device path (\\?\, \\.\). */
const isNetworkPath = text => /^[\\/]{2}/.test(String(text));

/** The value of an environment variable, any letter case on Windows (Path / PATH). */
function envValue(env, name) {
  const key = Object.keys(env).find(item => (WINDOWS ? item.toUpperCase() === name : item === name));
  return key === undefined ? '' : String(env[key]);
}

function isRunnableFile(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    if (!WINDOWS) fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

/** The candidate file names of `name`: itself when it already has a PATHEXT extension, then name + each extension. */
function candidates(name, pathext) {
  if (!WINDOWS) return [name];
  const exts = pathext.split(';').map(ext => ext.trim().toLowerCase()).filter(ext => /^\.[a-z0-9]+$/.test(ext));
  const own = path.extname(name).toLowerCase();
  return [...(own && exts.includes(own) ? [name] : []), ...exts.map(ext => name + ext)];
}

/**
 * @param {string} executable runtimeExecutable as validated @param {{root:string, cwd:string}} where real paths of the
 *   session folder and the working folder @param {object} [env] the GUI's environment (tests pass their own)
 * @returns {{program:string}|{error:string}} program: the real full path to spawn; error: a Hebrew reason
 */
function resolveProgram(executable, { root, cwd }, env = process.env) {
  if (isNetworkPath(executable)) return { error: `התוכנה "${executable}" בנתיב רשת; רק תוכנות מהמחשב הזה` };
  if (/[\\/]/.test(executable) || path.isAbsolute(executable)) {
    const real = realOrNull(path.resolve(cwd, executable));
    if (!real || isNetworkPath(real) || !isRunnableFile(real)) return { error: `התוכנה "${executable}" לא נמצאה (או שאינה קובץ שאפשר להריץ)` };
    return { program: real };
  }
  const pathext = envValue(env, 'PATHEXT') || DEFAULT_PATHEXT;
  const folders = envValue(env, 'PATH').split(path.delimiter).map(dir => dir.trim().replace(/^"(.*)"$/, '$1'))
    .filter(dir => dir && path.isAbsolute(dir) && !isNetworkPath(dir));
  for (const dir of folders) {
    const realDir = realOrNull(dir);
    if (!realDir || isNetworkPath(realDir) || isInside(realDir, root)) continue; // never a folder of the project
    for (const name of candidates(executable, pathext)) {
      const file = path.join(realDir, name);
      if (isRunnableFile(file)) return { program: realOrNull(file) || file };
    }
  }
  return { error: `התוכנה "${executable}" לא נמצאה ב-PATH של הממשק (תיקיות הפרויקט לא נבדקות). כתוב נתיב מלא ב-runtimeExecutable.` };
}

module.exports = { resolveProgram, isNetworkPath };
