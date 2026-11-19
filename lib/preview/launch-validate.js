/**
 * Strict validation of a session folder's `.claude/launch.json` (pure: no file access except checking a `cwd` folder).
 * The schema is a MINIMAL subset modelled on Claude Desktop's preview launch file; Desktop's exact format is UNVERIFIED
 * here, so anything outside this subset (an unknown field, a wrong type) refuses the whole file with a Hebrew reason
 * instead of guessing. Schema:
 *   { version: string, configurations: [{ name, runtimeExecutable, runtimeArgs?: string[], port?: number,
 *     url?: string (http(s) on localhost / 127.0.0.1 / [::1]), cwd?: relative folder inside the session folder,
 *     env?: { NAME: string } }] }
 */
const fs = require('fs');
const path = require('path');
const { isInside } = require('../files/safe-path');

const TOP_KEYS = ['version', 'configurations'];
const ENTRY_KEYS = ['name', 'runtimeExecutable', 'runtimeArgs', 'port', 'url', 'cwd', 'env'];
const MAX_CONFIGURATIONS = 20;
const MAX_ARGS = 100;
const MAX_ARG_CHARS = 4000;
const MAX_ENV = 50;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
// C0 / C1 controls, line and paragraph separators, and bidi marks / embeddings / isolates: they can make the
// confirmation show something other than what runs (a reordered or hidden part of a command).
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\u00ad\u200b-\u200d\u2060\ufeff]/;
// The executable may go through cmd.exe (a .cmd shim, spawn-utils.js): none of its special characters, no quotes, no %.
const EXECUTABLE = /^[\w\-.:\\/ @+~]+$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** A validation failure: a Hebrew message. */
class LaunchError extends Error {}
const fail = message => { throw new LaunchError(message); };
const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function onlyKeys(object, allowed, where) {
  const extra = Object.keys(object).find(key => !allowed.includes(key));
  if (extra !== undefined) fail(`${where}: שדה לא נתמך "${extra}" (נתמכים: ${allowed.join(', ')})`);
}

function text(value, where, max = 200) {
  if (typeof value !== 'string' || !value.trim()) fail(`${where} חייב להיות טקסט לא ריק`);
  if (value.length > max) fail(`${where} ארוך מדי (עד ${max} תווים)`);
  if (CONTROL.test(value)) fail(`${where} מכיל תווי בקרה`);
  return value;
}

function checkArgs(value, where) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ARGS) fail(`${where}.runtimeArgs חייב להיות רשימה של עד ${MAX_ARGS} מחרוזות`);
  return value.map((arg, index) => {
    if (typeof arg !== 'string' || arg.length > MAX_ARG_CHARS || CONTROL.test(arg)) fail(`${where}.runtimeArgs[${index}] חייב להיות מחרוזת בלי תווי בקרה`);
    // cmd.exe expands %NAME% even inside quotes (spawn-utils.js); refused everywhere so the file means the same on every system
    if (arg.includes('%')) fail(`${where}.runtimeArgs[${index}]: התו % לא נתמך`);
    return arg;
  });
}

function checkPort(value, where) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 1 || value > 65535) fail(`${where}.port חייב להיות מספר שלם בין 1 ל-65535`);
  return value;
}

/** @returns {{url:string, port:number}|null} */
function checkUrl(value, where) {
  if (value === undefined) return null;
  text(value, `${where}.url`, 2048);
  const head = value.match(/^(https?):\/\/(\[[^\]]*\]|[^/?#:@]*)(?::(\d{1,5}))?(?:[/?#]|$)/i);
  let url = null;
  try { url = new URL(value); } catch { /* refused below */ }
  if (!head || !url || url.username || url.password || !LOCAL_HOSTS.includes(head[2].toLowerCase())) {
    fail(`${where}.url: רק כתובת http(s) של המחשב הזה (localhost, 127.0.0.1 או [::1])`);
  }
  return { url: url.href, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) };
}

/** @returns {string} the real path of the working folder, inside the session folder */
function checkCwd(value, root, where) {
  if (value === undefined) return root;
  text(value, `${where}.cwd`, 1000);
  if (path.isAbsolute(value) || /^[a-z]:/i.test(value) || value.includes(':')) fail(`${where}.cwd חייב להיות נתיב יחסי בתוך תיקיית הסשן`);
  let real = null;
  try { real = fs.realpathSync.native(path.resolve(root, value)); } catch { fail(`${where}.cwd: התיקייה לא קיימת`); }
  if (!isInside(real, root)) fail(`${where}.cwd יוצא מתיקיית הסשן`);
  if (!fs.statSync(real).isDirectory()) fail(`${where}.cwd אינו תיקייה`);
  return real;
}

function checkEnv(value, where) {
  if (value === undefined) return {};
  if (!isPlain(value)) fail(`${where}.env חייב להיות אובייקט של שם -> ערך`);
  const keys = Object.keys(value);
  if (keys.length > MAX_ENV) fail(`${where}.env: עד ${MAX_ENV} משתנים`);
  const env = Object.create(null);
  for (const key of keys) {
    if (!ENV_NAME.test(key)) fail(`${where}.env: שם משתנה לא תקין "${key}"`);
    if (typeof value[key] !== 'string' || value[key].length > MAX_ARG_CHARS || CONTROL.test(value[key])) fail(`${where}.env.${key} חייב להיות מחרוזת בלי תווי בקרה`);
    env[key] = value[key];
  }
  return env;
}

function checkEntry(entry, index, root, guiPort) {
  const where = `configurations[${index}]`;
  if (!isPlain(entry)) fail(`${where} חייב להיות אובייקט`);
  onlyKeys(entry, ENTRY_KEYS, where);
  const name = text(entry.name, `${where}.name`, 100).trim();
  const executable = text(entry.runtimeExecutable, `${where}.runtimeExecutable`, 1000);
  if (!EXECUTABLE.test(executable)) fail(`${where}.runtimeExecutable מכיל תווים לא נתמכים (מרכאות, %, &, | וכו')`);
  if (/^[\\/]{2}/.test(executable)) fail(`${where}.runtimeExecutable בנתיב רשת (\\\\שרת\\...); רק תוכנות מהמחשב הזה`);
  const local = checkUrl(entry.url, where);
  const port = checkPort(entry.port, where) ?? local?.port ?? null;
  for (const used of [port, local?.port]) if (used === guiPort) fail(`${where}: הפורט ${guiPort} הוא הפורט של הממשק עצמו`);
  return {
    name, executable, args: checkArgs(entry.runtimeArgs, where), port,
    url: local?.url || (port ? `http://localhost:${port}/` : null),
    cwd: checkCwd(entry.cwd, root, where), env: checkEnv(entry.env, where),
  };
}

/**
 * @param {unknown} raw the parsed JSON @param {string} root the session folder's real path @param {number} guiPort
 * @returns {{name:string, executable:string, args:string[], port:number|null, url:string|null, cwd:string, env:object}[]}
 * @throws {LaunchError} with a Hebrew reason
 */
function validateLaunch(raw, root, guiPort) {
  if (!isPlain(raw)) fail('הקובץ חייב להכיל אובייקט JSON');
  onlyKeys(raw, TOP_KEYS, 'launch.json');
  if (!own(raw, 'version') || typeof raw.version !== 'string' || !raw.version.trim()) fail('חסר "version" (מחרוזת, למשל "0.0.1")');
  if (!Array.isArray(raw.configurations)) fail('"configurations" חייב להיות רשימה');
  if (raw.configurations.length > MAX_CONFIGURATIONS) fail(`עד ${MAX_CONFIGURATIONS} הגדרות`);
  const list = raw.configurations.map((entry, index) => checkEntry(entry, index, root, guiPort));
  const names = new Set();
  for (const { name } of list) { if (names.has(name)) fail(`השם "${name}" מופיע פעמיים`); names.add(name); }
  return list;
}

module.exports = { validateLaunch, LaunchError };
