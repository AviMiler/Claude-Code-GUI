/**
 * The CLI's conversation files of a folder, <config>/projects/<folder>/<id>.jsonl: the list /resume shows, their titles,
 * one conversation's lines and its subagents' lines, and when they changed. The CLI file is the conversation
 * (DECISIONS.md, 2026-10-29); the GUI builds what it shows from it (lib/history-build.js, ./transcript-items.js).
 */
const fs = require('fs');
const path = require('path');
const { configHome } = require('../claude-files');
const { readLines, parseLines } = require('./jsonl-reader');
const { userText } = require('./transcript-items');

const TITLE_SCAN_BYTES = 256 * 1024;
const MAX_LIST = 150;

/** The CLI names a project folder by replacing every non-alphanumeric character with '-'. */
function projectDirs(config, cwd) {
  const root = path.join(configHome(config), 'projects');
  const name = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (!fs.existsSync(root)) return [];
  if (fs.existsSync(path.join(root, name))) return [path.join(root, name)];
  const prefix = name.slice(0, 200); // very long paths are cut and suffixed with a hash
  return fs.readdirSync(root).filter(dir => dir.startsWith(prefix)).map(dir => path.join(root, dir));
}

/**
 * The names the CLI keeps for a conversation, like its /resume picker: `custom` is a name a person gave (/rename,
 * `--name`, the GUI), `auto` is the CLI's own (its generated title, a summary, or the first prompt).
 * @returns {{custom:string|null, auto:string|null}}
 */
function titlesOf(lines) {
  const last = type => [...lines].reverse().find(line => line.type === type);
  const first = lines.map(line => userText(line)).find(Boolean); // not map(userText): the index would count as images
  return {
    custom: last('custom-title')?.customTitle || null,
    auto: last('ai-title')?.aiTitle || last('summary')?.summary || (first ? first.replace(/\s+/g, ' ').slice(0, 120) : null),
  };
}

function titleOf(lines) {
  const { custom, auto } = titlesOf(lines);
  return custom || auto || '(ללא כותרת)';
}

/** The CLI file of one conversation, or null. */
function transcriptFile(config, cwd, id) {
  if (!/^[\w-]+$/.test(id || '')) return null;
  return projectDirs(config, cwd).map(dir => path.join(dir, `${id}.jsonl`)).find(fs.existsSync) || null;
}

/** Lines of the start and the end of a file: the CLI appends its title lines again as the conversation grows. */
function edgeLines(file) {
  const { size } = fs.statSync(file);
  const handle = fs.openSync(file, 'r');
  try {
    const read = (start, length) => {
      const buffer = Buffer.alloc(length);
      fs.readSync(handle, buffer, 0, length, start);
      return buffer.toString('utf8');
    };
    if (size <= 2 * TITLE_SCAN_BYTES) return parseLines(read(0, size));
    return parseLines(`${read(0, TITLE_SCAN_BYTES)}\n${read(size - TITLE_SCAN_BYTES, TITLE_SCAN_BYTES)}`);
  } finally {
    fs.closeSync(handle);
  }
}

/** @returns {{custom:string|null, auto:string|null, mtimeMs:number}|null} null when the CLI has no file for it */
function readTitles(config, { cwd, id }) {
  const file = transcriptFile(config, cwd, id);
  if (!file) return null;
  return { ...titlesOf(edgeLines(file)), mtimeMs: fs.statSync(file).mtimeMs };
}

/**
 * Names a conversation the way the CLI's own /rename does when no process holds it: a `custom-title` line appended
 * to its file (the last one wins). @returns {boolean} false when the CLI has no file for it yet
 */
function appendTitle(config, { cwd, id, title }) {
  const file = transcriptFile(config, cwd, id);
  if (!file) return false;
  fs.appendFileSync(file, `${JSON.stringify({ type: 'custom-title', customTitle: title, sessionId: id })}\n`);
  return true;
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
      const lines = edgeLines(full);
      if (!lines.some(line => line.type === 'user' || line.type === 'assistant')) continue;
      entries.push({ id: file.replace(/\.jsonl$/, ''), title: titleOf(lines), updatedAt: stat.mtimeMs, sizeBytes: stat.size });
    }
  }
  return entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LIST);
}

/** A conversation's file: its lines and when it last changed. @returns {{lines:object[], mtimeMs:number}|null} */
function readConversation(config, { cwd, id }) {
  const file = transcriptFile(config, cwd, id);
  if (!file) return null;
  const { mtimeMs } = fs.statSync(file);
  return { lines: readLines(file), mtimeMs };
}

/** The folder of a conversation's subagents: <id>/subagents beside its file, one agent-<id>.jsonl + .meta.json each. */
const subagentsDir = file => path.join(file.replace(/\.jsonl$/, ''), 'subagents');

/**
 * When a conversation's file or one of its subagents' files last changed, without reading them.
 * @returns {string|null} null when there is no file
 */
function conversationStamp(config, { cwd, id }) {
  const file = transcriptFile(config, cwd, id);
  if (!file) return null;
  const dir = subagentsDir(file);
  const agents = fs.existsSync(dir) ? fs.readdirSync(dir).map(name => fs.statSync(path.join(dir, name)).mtimeMs) : [];
  return [fs.statSync(file).mtimeMs, ...agents].join(',');
}

/**
 * The subagents a conversation ran (the Agent tool): each one's lines, by the id of the tool call that started it (its
 * `.meta.json` `toolUseId`). @returns {Map<string, object[]>}
 */
function readSubagents(config, { cwd, id }) {
  const file = transcriptFile(config, cwd, id);
  const dir = file && subagentsDir(file);
  const agents = new Map();
  if (!dir || !fs.existsSync(dir)) return agents;
  for (const name of fs.readdirSync(dir).filter(entry => entry.endsWith('.meta.json'))) {
    try {
      const { toolUseId } = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      const lines = path.join(dir, name.replace(/\.meta\.json$/, '.jsonl'));
      if (toolUseId && fs.existsSync(lines)) agents.set(toolUseId, readLines(lines));
    } catch (error) {
      console.error('[transcripts] subagent not read:', name, error.message);
    }
  }
  return agents;
}

module.exports = { listTranscripts, readTitles, appendTitle, readConversation, readSubagents, conversationStamp, titlesOf };
