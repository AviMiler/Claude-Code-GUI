/**
 * A prompt template as a CLI custom command file (<config>/commands/<name>.md): front matter (`description` = the
 * template's name, `argument-hint` = its variables' names) and a body with the CLI's `$ARGUMENTS` / `$1`…`$9`. The GUI
 * editor and fill form use `{{name}}`; this converts between the two. Other front-matter lines are kept as they are.
 */
const VARIABLE = /\{\{\s*([\p{L}\p{N}_\- ]{1,40}?)\s*\}\}/gu; // the same rule as public/js/templates.js
const MAX_VARIABLES = 9; // the CLI's $1…$9
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
// The CLI runs !`command` and reads a line starting with @path when the command is used: only the CLI can fill those.
const EXPANDS = /!`[^`\n]+`|^@\S/m;

const unquote = value => {
  if (/^".*"$/.test(value)) { try { return JSON.parse(value); } catch { return value.slice(1, -1); } }
  return /^'.*'$/.test(value) ? value.slice(1, -1).replace(/''/g, "'") : value;
};

/** @param {string} content a command file @returns {{lines:string[], body:string}} lines: the front matter's lines */
function splitFile(content) {
  const text = content.replace(/^\uFEFF/, ''); // Notepad's BOM: the front matter still starts the file
  const match = text.match(FRONT);
  return match ? { lines: match[1].split(/\r?\n/), body: text.slice(match[0].length) } : { lines: [], body: text };
}

/** @returns {string} a front-matter key's value ('' when missing); a block value (`key: |`) is its indented lines joined */
function fieldOf(lines, key) {
  const at = lines.findIndex(entry => entry.startsWith(`${key}:`));
  if (at < 0) return '';
  const value = lines[at].slice(key.length + 1).trim();
  if (!/^[|>][+-]?$/.test(value)) return unquote(value);
  const block = [];
  for (let index = at + 1; index < lines.length && /^\s+\S/.test(lines[index]); index += 1) block.push(lines[index].trim());
  return block.join(' ');
}

/** The lines with `key` set to `value` (quoted), or removed when value is ''; a multi-line value's indented lines go with it. */
function withField(lines, key, value) {
  const at = lines.findIndex(entry => entry.startsWith(`${key}:`));
  let end = at + 1;
  if (at >= 0) while (end < lines.length && /^\s+\S/.test(lines[end])) end += 1;
  const replacement = value ? [`${key}: ${JSON.stringify(value)}`] : [];
  return at < 0 ? [...lines, ...replacement] : [...lines.slice(0, at), ...replacement, ...lines.slice(end)];
}

/** @param {string} text editor text with {{name}} @returns {string[]} the variables in order of first appearance */
const variablesOf = text => [...new Set([...String(text).matchAll(VARIABLE)].map(match => match[1].trim()))];

const hintNames = hint => [...String(hint).matchAll(/\[([^\]]+)\]/g)].map(match => match[1].trim());
/** The editor names of $1…$9 in a file: from its argument hint, else "ערך N". */
const positionNames = hint => Array.from({ length: MAX_VARIABLES }, (_, index) => hintNames(hint)[index] || `ערך ${index + 1}`);

/**
 * Editor text -> the file's body and argument hint. Variables the file already had keep their position ($2 stays $2),
 * new ones follow in order of first appearance. A single variable becomes `$ARGUMENTS` (a value with spaces then works
 * in the terminal too) unless the file numbered it.
 * @param {string} text
 * @param {{lenient?:boolean, previous?:{lines:string[], body:string}}} [options] lenient: more than 9 variables keep their
 *   {{name}} (migration); previous: the file as it was
 * @returns {{body:string, hint:string}}
 * @throws {Error} with status 400 for more than 9 variables
 */
function fromEditor(text, { lenient = false, previous = { lines: [], body: '' } } = {}) {
  const appearance = variablesOf(text);
  if (appearance.length > MAX_VARIABLES) {
    if (lenient) return { body: text, hint: '' };
    throw Object.assign(new Error(`אפשר עד ${MAX_VARIABLES} משתנים בתבנית (כמו $1…$9 של ה-CLI)`), { status: 400 });
  }
  const order = previous.lines.length || previous.body ? positionNames(fieldOf(previous.lines, 'argument-hint')) : [];
  const rank = name => (order.includes(name) ? order.indexOf(name) : MAX_VARIABLES + appearance.indexOf(name));
  const names = [...appearance].sort((a, b) => rank(a) - rank(b));
  const single = names.length === 1 && !/\$[1-9](?!\d)/.test(previous.body);
  const token = name => (single ? '$ARGUMENTS' : `$${names.indexOf(name) + 1}`);
  const hint = single && names[0] === 'ARGUMENTS' ? '' : names.map(name => `[${name}]`).join(' '); // $ARGUMENTS needs no name
  return { body: text.replace(VARIABLE, (whole, name) => token(name.trim())), hint };
}

/** The file's body -> editor text: `$ARGUMENTS` and `$N` become {{name}}, named from the argument hint. */
function toEditor(body, hint) {
  const names = positionNames(hint);
  return body.replace(/\$ARGUMENTS\b/g, `{{${hintNames(hint)[0] || 'ARGUMENTS'}}}`)
    .replace(/\$([1-9])(?!\d)/g, (whole, digit) => `{{${names[digit - 1]}}}`);
}

/**
 * @param {string} name the command name (file name) @param {string} content @param {number} updatedAt the file's mtime
 * @returns {{id:string, name:string, text:string, expands:boolean, updatedAt:number}} expands: insert `/name`, not the text
 */
function toTemplate(name, content, updatedAt) {
  const { lines, body } = splitFile(content);
  return { id: name, name: fieldOf(lines, 'description') || name, text: toEditor(body, fieldOf(lines, 'argument-hint')), expands: EXPANDS.test(body), updatedAt };
}

/**
 * The file content for a template; `previous` keeps the other front-matter lines (allowed-tools, model…).
 * @param {{description:string, text:string, previous?:string, lenient?:boolean}} template
 * @returns {string}
 */
function toFile({ description, text, previous = '', lenient = false }) {
  const old = splitFile(previous);
  const { body, hint } = fromEditor(text, { lenient, previous: old });
  const lines = withField(withField(old.lines, 'description', description), 'argument-hint', hint);
  return lines.length || body.startsWith('---') ? `---\n${lines.join('\n')}\n---\n${body}` : body;
}

module.exports = { toTemplate, toFile };
