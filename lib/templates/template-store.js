/**
 * Prompt templates are the user's CLI custom commands (DECISIONS.md, 2026-10-30): every file in <config>/commands
 * (honours CLAUDE_CONFIG_DIR; not subfolders, not project commands) is one, so the terminal's `/name` and the GUI share
 * them. The file name is the command name; ./command-format.js reads and writes the content.
 */
const fs = require('fs');
const path = require('path');
const { configHome, NAME_PATTERN } = require('../claude-files');
const { httpError } = require('../http-utils');
const { toTemplate, toFile } = require('./command-format');

const MAX_TEMPLATES = 200;
const MAX_NAME_CHARS = 80;
const MAX_TEXT_CHARS = 20000;

const commandsDir = config => path.join(configHome(config), 'commands');
const fileOf = (config, name) => path.join(commandsDir(config), `${name}.md`);

function requireName(name) {
  if (!NAME_PATTERN.test(name || '')) throw httpError(400, 'שם הפקודה בטרמינל לא תקין (אותיות לטיניות, ספרות, - ו-_ בלבד)');
  return name;
}

/** @returns {string[]} the command names in the folder */
function names(config) {
  const dir = commandsDir(config);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md') && NAME_PATTERN.test(entry.name.slice(0, -3)))
    .map(entry => entry.name.slice(0, -3));
}

/** @param {object} config @returns {{id:string, name:string, text:string, expands:boolean, updatedAt:number}[]} newest first */
function list(config) {
  return names(config).map(name => {
    const file = fileOf(config, name);
    return toTemplate(name, fs.readFileSync(file, 'utf8'), fs.statSync(file).mtimeMs);
  }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_TEMPLATES);
}

/** Written to a temporary file first, so the CLI never reads a half-written command. */
function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

/**
 * Creates, updates or renames a template.
 * @param {object} config @param {string} name the command name to save under
 * @param {{description:string, text:string, create?:boolean, previous?:string}} body create: a new one (an existing
 *   command of that name is a 409); previous: the name it had (a rename when it differs)
 * @returns {object} the template as list() gives it
 * @example save(config, 'review', { description: 'סקירת קוד', text: 'סקור את {{קובץ}}', create: true })
 */
function save(config, name, { description, text, create = false, previous } = {}) {
  requireName(name);
  const source = create ? null : requireName(previous || name);
  const cleanName = typeof description === 'string' ? description.trim() : '';
  if (!cleanName) throw httpError(400, 'לתבנית חסר שם');
  if (cleanName.length > MAX_NAME_CHARS) throw httpError(400, `השם ארוך מדי (עד ${MAX_NAME_CHARS} תווים)`);
  if (typeof text !== 'string' || !text.trim()) throw httpError(400, 'התבנית ריקה');
  if (text.length > MAX_TEXT_CHARS) throw httpError(400, `התבנית ארוכה מדי (עד ${MAX_TEXT_CHARS} תווים)`);
  const file = fileOf(config, name);
  if (source !== name && fs.existsSync(file)) throw httpError(409, `כבר יש פקודה בשם /${name}`);
  if (source && !fs.existsSync(fileOf(config, source))) throw httpError(404, 'התבנית לא נמצאה');
  if (!source && names(config).length >= MAX_TEMPLATES) throw httpError(409, `אפשר לשמור עד ${MAX_TEMPLATES} תבניות`);
  const old = source ? fs.readFileSync(fileOf(config, source), 'utf8') : '';
  writeFile(file, toFile({ description: cleanName, text, previous: old }));
  if (source && source !== name) fs.unlinkSync(fileOf(config, source));
  return toTemplate(name, fs.readFileSync(file, 'utf8'), fs.statSync(file).mtimeMs);
}

/** @param {object} config @param {string} name */
function remove(config, name) {
  const file = fileOf(config, requireName(name));
  if (!fs.existsSync(file)) throw httpError(404, 'התבנית לא נמצאה');
  fs.unlinkSync(file);
}

module.exports = { list, save, remove, commandsDir, writeFile };
