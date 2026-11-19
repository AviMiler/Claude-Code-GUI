/**
 * The stored automatic check of each project folder ({ command, shell, enabled }), in data/verify-checks.json.
 * Keyed by the PROJECT folder (a worktree session uses its source folder), so every session of a project shares it.
 * Written atomically (temp file + rename): a crash never leaves half a file.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../session-store');
const { httpError } = require('../http-utils');
const { SHELLS, DEFAULT_SHELL } = require('../terminal/shell-spec');

const FILE = path.join(DATA_DIR, 'verify-checks.json');
const MAX_COMMAND_CHARS = 8000;
let cache = null;

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') console.error('[verify-store] cannot read verify-checks.json:', error.message);
    cache = {};
  }
  return cache;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(cache, null, 2));
  fs.renameSync(temp, FILE);
}

/** The folder a session's check belongs to. @param {{cwd:string, worktree?:{source?:string}}} session */
const projectFolder = session => session.worktree?.source || session.cwd;

/** @returns {{command:string, shell:string, enabled:boolean}|null} */
const getCheck = folder => load()[folder] || null;

/** @param {object} body from the request @returns {{command:string, shell:string, enabled:boolean}} @throws 400 */
function validCheck(body) {
  const { command, shell = DEFAULT_SHELL, enabled = true } = body || {};
  if (typeof command !== 'string' || !command.trim() || command.includes('\0')) throw httpError(400, 'פקודת הבדיקה ריקה');
  if (command.length > MAX_COMMAND_CHARS) throw httpError(400, `פקודת הבדיקה ארוכה מדי (עד ${MAX_COMMAND_CHARS} תווים)`);
  if (!SHELLS.includes(shell)) throw httpError(400, 'סוג ה-shell לא נתמך במערכת הזאת');
  if (typeof enabled !== 'boolean') throw httpError(400, 'הערך "פעיל" חייב להיות כן או לא');
  return { command: command.trim(), shell, enabled };
}

function setCheck(folder, check) { load()[folder] = check; save(); return check; }
function clearCheck(folder) { if (load()[folder]) { delete cache[folder]; save(); } }

module.exports = { projectFolder, getCheck, validCheck, setCheck, clearCheck };
