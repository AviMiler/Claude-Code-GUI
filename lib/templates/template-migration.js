/**
 * Moves the templates the GUI kept in data/templates.json (before 2026-10-30) into the user's CLI commands folder, once,
 * at startup. Nothing is overwritten: a name already taken gets a suffix, an identical file means it was moved before.
 * The JSON is renamed to templates.json.migrated only when every template has its file, so a failed run is retried.
 */
const fs = require('fs');
const path = require('path');
const { toFile } = require('./command-format');
const { commandsDir, writeFile } = require('./template-store');

const DATA_FILE = path.join(process.env.CLAUDE_GUI_DATA || path.join(__dirname, '..', '..', 'data'), 'templates.json');

/** A command name from the Latin letters and digits of a template's name ('' when it has none). */
const slugOf = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** @returns {string|null} the name the template got, or null when no free name was found */
function placeOne(config, template) {
  const content = toFile({ description: String(template.name || '').trim().slice(0, 80) || 'תבנית', text: String(template.text || ''), lenient: true });
  const base = slugOf(template.name);
  const candidates = Array.from({ length: 99 }, (_, index) => (base ? (index ? `${base}-${index + 1}` : base) : `template-${index + 1}`));
  for (const name of candidates) {
    const file = path.join(commandsDir(config), `${name}.md`);
    if (fs.existsSync(file)) {
      if (fs.readFileSync(file, 'utf8') === content) return name; // moved by an earlier run whose rename failed
      continue;
    }
    writeFile(file, content);
    if (template.updatedAt) fs.utimesSync(file, new Date(), new Date(template.updatedAt)); // keeps the newest-first order
    return name;
  }
  return null;
}

/** @param {object} config the server's @returns {number} how many templates were moved (0 when there was nothing to do) */
function migrateTemplates(config) {
  if (!fs.existsSync(DATA_FILE)) return 0;
  try {
    const templates = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const placed = (Array.isArray(templates) ? templates : []).map(template => placeOne(config, template));
    if (placed.some(name => name === null)) throw new Error('no free command name for every template');
    fs.renameSync(DATA_FILE, `${DATA_FILE}.migrated`);
    console.log(`[templates] ${placed.length} templates moved to ${commandsDir(config)}`);
    return placed.length;
  } catch (error) {
    console.error('[templates] templates.json not moved:', error.message);
    return 0;
  }
}

module.exports = { migrateTemplates, slugOf };
