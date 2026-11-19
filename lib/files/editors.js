/**
 * External editors the GUI may start, and how a program is found and launched. The editor is never a request value:
 * the config key `editor` picks an entry of EDITORS, and each entry maps to one fixed executable name.
 */
const fs = require('fs');
const path = require('path');
const { httpError } = require('../http-utils');

/** key -> { label, bin }; `windowsOnly` entries exist only on Windows. */
const EDITORS = {
  code: { label: 'VS Code', bin: 'code' },
  cursor: { label: 'Cursor', bin: 'cursor' },
  zed: { label: 'Zed', bin: 'zed' },
  notepad: { label: 'Notepad', bin: 'notepad', windowsOnly: true },
};
const EDITOR_KEYS = Object.keys(EDITORS);
const DEFAULT_EDITOR = 'code';
const WINDOWS_EXTENSIONS = ['.exe', '.com', '.cmd', '.bat']; // fixed list: .cmd shims (code, cursor) need cmd.exe
// A path that goes inside cmd.exe's double quotes: refuse what cmd would still interpret there.
const UNSAFE_FOR_CMD = /["%^&|<>!`\0\r\n]/;

/** @param {*} value from config @returns {string} a known editor key, else the default */
const normalizeEditor = value => (EDITOR_KEYS.includes(value) ? value : DEFAULT_EDITOR);

const isFile = file => { try { return fs.statSync(file).isFile(); } catch { return false; } };

/**
 * The executable of a program name on PATH, or null.
 * @param {string} bin fixed name from EDITORS @param {{platform?:string, env?:object, exists?:(file:string)=>boolean}} [deps]
 * @returns {string|null}
 */
function findOnPath(bin, { platform = process.platform, env = process.env, exists = isFile } = {}) {
  const windows = platform === 'win32';
  const dirs = String(env.PATH || env.Path || '').split(windows ? ';' : ':').map(dir => dir.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
  for (const dir of dirs) {
    for (const extension of windows ? WINDOWS_EXTENSIONS : ['']) {
      const file = (windows ? path.win32 : path).join(dir, bin + extension);
      if (exists(file)) return file;
    }
  }
  return null;
}

const quote = text => `"${text}"`;

/**
 * The spawn call that opens `target` in an editor. Windows: a .exe runs directly; a .cmd shim goes through cmd.exe with the
 * paths in double quotes (a path cmd could still interpret is refused). Missing program: a Hebrew 404, except that on Windows
 * a missing editor falls back to Notepad (for a file).
 * @param {{editor:string, target:string, isDir:boolean}} request @param {object} [deps] platform, env, exists
 * @returns {{command:string, args:string[], options:object, editor:string}}
 */
function buildEditorLaunch({ editor, target, isDir }, deps = {}) {
  const platform = deps.platform || process.platform;
  let key = normalizeEditor(editor);
  const wanted = EDITORS[key].label; // named in the error even after a fallback
  if (EDITORS[key].windowsOnly && platform !== 'win32') key = DEFAULT_EDITOR;
  let exe = findOnPath(EDITORS[key].bin, deps);
  if (!exe && platform === 'win32' && !isDir && key !== 'notepad') { key = 'notepad'; exe = findOnPath('notepad', deps); }
  if (!exe) throw httpError(404, `העורך ${wanted} לא נמצא בנתיב החיפוש (PATH). אפשר לבחור עורך אחר במפתח "editor" ב-config.json (code, cursor, zed).`);
  if (key === 'notepad' && isDir) throw httpError(400, 'Notepad לא פותח תיקייה');
  const options = { detached: true, stdio: 'ignore', windowsHide: true };
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(exe)) {
    if (UNSAFE_FOR_CMD.test(target) || UNSAFE_FOR_CMD.test(exe)) throw httpError(400, 'בנתיב יש תווים שאי אפשר להעביר לעורך בבטחה (כמו % או &)');
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', quote(`${quote(exe)} ${quote(target)}`)], options: { ...options, windowsVerbatimArguments: true }, editor: key };
  }
  return { command: exe, args: [target], options, editor: key };
}

/**
 * @param {{target:string, isDir:boolean}} request @param {string} [platform]
 * @returns {{command:string, args:string[], options:object}} the call that shows `target` in the system file manager (501 elsewhere)
 */
function buildRevealLaunch({ target, isDir }, platform = process.platform) {
  const options = { detached: true, stdio: 'ignore', windowsHide: false };
  if (platform === 'win32') return { command: 'explorer.exe', args: isDir ? [target] : ['/select,', target], options };
  if (platform === 'darwin') return { command: 'open', args: isDir ? [target] : ['-R', target], options };
  if (platform === 'linux') return { command: 'xdg-open', args: [isDir ? target : path.dirname(target)], options };
  throw httpError(501, 'הצגה בסייר הקבצים לא נתמכת במערכת הזאת');
}

/**
 * Starts the program and lets it go; resolves once it started, rejects (Hebrew 404) when it cannot be found.
 * @param {Function} spawn child_process.spawn or a stand-in @param {{command:string, args:string[], options:object}} plan
 * @returns {Promise<void>}
 */
function launch(spawn, { command, args, options }) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(command, args, options); } catch (error) { return reject(httpError(500, `ההפעלה נכשלה: ${error.message}`)); }
    child.once('error', error => reject(error.code === 'ENOENT' ? httpError(404, 'התוכנית לא נמצאה') : httpError(500, `ההפעלה נכשלה: ${error.message}`)));
    child.once('spawn', () => { child.unref?.(); resolve(); });
  });
}

module.exports = { EDITORS, EDITOR_KEYS, DEFAULT_EDITOR, normalizeEditor, findOnPath, buildEditorLaunch, buildRevealLaunch, launch };
