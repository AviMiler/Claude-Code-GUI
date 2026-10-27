/**
 * Past CLI conversations of a folder (what /resume shows), read from ~/.claude/projects/<folder>/<id>.jsonl.
 * Importing one creates a GUI session that continues it with --resume.
 */
const fs = require('fs');
const path = require('path');
const { configHome } = require('./claude-files');
const { translateEvent, localCommandOutput } = require('./event-translator');

const TITLE_SCAN_BYTES = 256 * 1024;
const MAX_LIST = 150;
const MAX_IMPORT_ITEMS = 3000;
const COMMAND_NAME = /<command-name>\/?([^<]*)<\/command-name>/;
const COMMAND_ARGS = /<command-args>([^<]*)<\/command-args>/;

/** The CLI names a project folder by replacing every non-alphanumeric character with '-'. */
function projectDirs(config, cwd) {
  const root = path.join(configHome(config), 'projects');
  const name = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (!fs.existsSync(root)) return [];
  if (fs.existsSync(path.join(root, name))) return [path.join(root, name)];
  const prefix = name.slice(0, 200); // very long paths are cut and suffixed with a hash
  return fs.readdirSync(root).filter(dir => dir.startsWith(prefix)).map(dir => path.join(root, dir));
}

function parseLines(text) {
  return text.split('\n').map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

/** Text the user typed, or null for meta/tool lines. */
function userText(line) {
  if (line.type !== 'user' || line.isMeta || line.isSidechain) return null;
  const content = line.message?.content;
  const text = typeof content === 'string' ? content
    : Array.isArray(content) ? content.filter(block => block.type === 'text').map(block => block.text).join('\n') : '';
  // Images of past conversations are not stored by the GUI; their place in the text is marked.
  const imageCount = Array.isArray(content) ? content.filter(block => block.type === 'image').length : 0;
  if (imageCount && !text.startsWith('<')) return `${imageCount > 1 ? `[${imageCount} תמונות]` : '[תמונה]'}${text.trim() ? ` ${text}` : ''}`;
  const command = text.match(COMMAND_NAME);
  if (command) return `/${command[1]} ${(text.match(COMMAND_ARGS) || [, ''])[1]}`.trim();
  if (!text.trim() || text.startsWith('<') || text.startsWith('Caveat:')) return null;
  return text;
}

function titleOf(lines) {
  const named = [...lines].reverse().find(line => line.type === 'custom-title' || line.type === 'summary');
  if (named) return named.customTitle || named.summary;
  const first = lines.map(userText).find(Boolean);
  return first ? first.replace(/\s+/g, ' ').slice(0, 120) : '(ללא כותרת)';
}

/**
 * @param {object} config @param {{cwd:string}} query
 * @returns {{id:string, title:string, updatedAt:number, sizeBytes:number}[]}
 */
function listTranscripts(config, { cwd }) {
  const entries = [];
  for (const dir of projectDirs(config, cwd)) {
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.jsonl'))) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      const handle = fs.openSync(full, 'r');
      const buffer = Buffer.alloc(Math.min(stat.size, TITLE_SCAN_BYTES));
      fs.readSync(handle, buffer, 0, buffer.length, 0);
      fs.closeSync(handle);
      const lines = parseLines(buffer.toString('utf8'));
      if (!lines.some(line => line.type === 'user' || line.type === 'assistant')) continue;
      entries.push({ id: file.replace(/\.jsonl$/, ''), title: titleOf(lines), updatedAt: stat.mtimeMs, sizeBytes: stat.size });
    }
  }
  return entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LIST);
}

/** Converts one transcript into GUI items (main thread only; subagent side-chains are skipped). */
function transcriptItems(config, { cwd, id }) {
  if (!/^[\w-]+$/.test(id || '')) return null;
  const file = projectDirs(config, cwd).map(dir => path.join(dir, `${id}.jsonl`)).find(fs.existsSync);
  if (!file) return null;
  const lines = parseLines(fs.readFileSync(file, 'utf8'));
  const items = [];
  for (const line of lines) {
    if (line.isSidechain) continue;
    const typed = userText(line);
    if (typed) { items.push({ kind: 'user', text: typed }); continue; }
    if (line.type === 'system' && line.subtype === 'local_command') {
      const output = localCommandOutput(line.content || '');
      if (output) items.push(output);
      continue;
    }
    if (line.isMeta) continue;
    items.push(...translateEvent(line).filter(item => item.kind !== 'result'));
  }
  return { title: titleOf(lines), items: items.slice(-MAX_IMPORT_ITEMS) };
}

module.exports = { listTranscripts, transcriptItems };
