/**
 * Prompt templates the user saves and reuses, stored in the data folder (templates.json next to sessions.json),
 * so they survive a browser reset and every tab sees the same list.
 */
const fs = require('fs');
const path = require('path');
const { httpError } = require('./http-utils');

const DATA_DIR = process.env.CLAUDE_GUI_DATA || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'templates.json');
const MAX_TEMPLATES = 200;
const MAX_NAME_CHARS = 80;
const MAX_TEXT_CHARS = 20000;
const ID_PATTERN = /^[\w-]{1,64}$/;

/** @typedef {{id:string, name:string, text:string, createdAt:number, updatedAt:number}} Template */

/** @returns {Template[]} newest first; a missing file is an empty list, a broken one is logged */
function list() {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(saved) ? saved.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[templates] cannot read templates:', error.message);
    return [];
  }
}

// Written to a temporary file first, so a crash mid-write never leaves a half-written list.
function writeAll(templates) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(templates, null, 1));
  fs.renameSync(temporary, DATA_FILE);
}

/**
 * Creates or updates a template.
 * @param {string} id chosen by the browser (a uuid)
 * @param {{name:string, text:string}} body
 * @returns {Template}
 * @example save('6f1c…', { name: 'Code review', text: 'Review {{file}} for bugs' })
 */
function save(id, { name, text } = {}) {
  if (!ID_PATTERN.test(id)) throw httpError(400, 'מזהה תבנית לא תקין');
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) throw httpError(400, 'לתבנית חסר שם');
  if (cleanName.length > MAX_NAME_CHARS) throw httpError(400, `השם ארוך מדי (עד ${MAX_NAME_CHARS} תווים)`);
  if (typeof text !== 'string' || !text.trim()) throw httpError(400, 'התבנית ריקה');
  if (text.length > MAX_TEXT_CHARS) throw httpError(400, `התבנית ארוכה מדי (עד ${MAX_TEXT_CHARS} תווים)`);
  const templates = list();
  const existing = templates.find(template => template.id === id);
  if (!existing && templates.length >= MAX_TEMPLATES) throw httpError(409, `אפשר לשמור עד ${MAX_TEMPLATES} תבניות`);
  const now = Date.now();
  const template = { id, name: cleanName, text, createdAt: existing?.createdAt || now, updatedAt: now };
  writeAll([template, ...templates.filter(item => item.id !== id)]);
  return template;
}

/** @param {string} id */
function remove(id) {
  const templates = list();
  if (!templates.some(template => template.id === id)) throw httpError(404, 'התבנית לא נמצאה');
  writeAll(templates.filter(template => template.id !== id));
}

module.exports = { list, save, remove };
