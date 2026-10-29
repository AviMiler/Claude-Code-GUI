/**
 * The CLI's conversations of a folder, read from <config>/projects/<folder>/<id>.jsonl: the list /resume shows, their
 * titles, and one conversation as GUI items. The CLI file is the conversation (DECISIONS.md, 2026-10-29); the GUI
 * builds what it shows from it (lib/history-build.js). Images the user sent are stored like composer attachments
 * (lib/images.js), under an id from their bytes, so reading the file again gives the same thumbnails.
 */
const fs = require('fs');
const path = require('path');
const { configHome } = require('./claude-files');
const { translateEvent, localCommandOutput } = require('./event-translator');
const images = require('./images');

const TITLE_SCAN_BYTES = 256 * 1024;
const MAX_LIST = 150;
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

const imageBlocks = line => (Array.isArray(line.message?.content) ? line.message.content.filter(block => block.type === 'image') : []);

/** The text of a user line as the CLI received it (text blocks joined), or of a message queued into a running turn. */
function rawText(line) {
  if (line.type === 'attachment') return String(line.attachment?.prompt ?? '');
  const content = line.message?.content;
  return typeof content === 'string' ? content
    : Array.isArray(content) ? content.filter(block => block.type === 'text').map(block => block.text).join('\n') : '';
}

/**
 * Text the user typed, or null for meta/tool lines.
 * @param {object} line @param {number} [markedImages] images shown as a "[תמונה]" marker (all of them, unless stored)
 */
function userText(line, markedImages = imageBlocks(line).length) {
  if (line.type !== 'user' || line.isMeta || line.isSidechain) return null;
  const text = rawText(line);
  if (markedImages && !text.startsWith('<')) return `${markedImages > 1 ? `[${markedImages} תמונות]` : '[תמונה]'}${text.trim() ? ` ${text}` : ''}`;
  const command = text.match(COMMAND_NAME);
  if (command) return `/${command[1]} ${(text.match(COMMAND_ARGS) || [, ''])[1]}`.trim();
  if (!text.trim() || text.startsWith('<') || text.startsWith('Caveat:')) return null;
  return text;
}

/**
 * Stores the base64 images of a user line one by one (the same checks as composer images: type, magic bytes, 5 MB).
 * @returns {{stored:{id:string, mediaType:string, name:string}[], failed:number}} failed: by URL/file, or rejected
 */
function storeImages(blocks) {
  const stored = [];
  let failed = 0;
  blocks.forEach((block, index) => {
    if (block.source?.type !== 'base64') { failed += 1; return; }
    try {
      stored.push(...images.saveImages([{ data: block.source.data, mediaType: block.source.media_type, name: `תמונה ${index + 1}` }], { stable: true }));
    } catch (error) {
      console.error('[transcripts] image not imported:', error.message);
      failed += 1;
    }
  });
  return { stored, failed };
}

/** A typed user line as a GUI item: its images stored and attached, the ones that could not be stored as a marker. */
function userItem(line) {
  const blocks = imageBlocks(line);
  const text = blocks.length ? line.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n') : '';
  // Lines whose text is a tag (command output…) never had their images marked; they are not stored either.
  if (!blocks.length || text.startsWith('<')) return { kind: 'user', text: userText(line) };
  const { stored, failed } = storeImages(blocks);
  return { kind: 'user', text: userText(line, failed) ?? '', ...(stored.length && { images: stored }) };
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
  return { lines: parseLines(fs.readFileSync(file, 'utf8')), mtimeMs };
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
      if (toolUseId && fs.existsSync(lines)) agents.set(toolUseId, parseLines(fs.readFileSync(lines, 'utf8')));
    } catch (error) {
      console.error('[transcripts] subagent not read:', name, error.message);
    }
  }
  return agents;
}

/** A subagent's lines as items inside the tool row that started it (`parent`), like they arrive live. */
const subagentItems = (lines, toolUseId) => lines.filter(line => !line.isMeta)
  .flatMap(line => translateEvent({ ...line, parent_tool_use_id: toolUseId }).filter(item => item.kind !== 'result'));

/**
 * The conversation as the CLI resumes it: from its latest line (or `leafUuid`, a rewind's point) back through
 * `parentUuid`. A compaction boundary has no parent; its `logicalParentUuid` leads on to the history before it. What a
 * rewind left behind, and subagent side chains, are not in it.
 * @returns {object[]} the lines, oldest first
 */
function chainOf(lines, leafUuid = null) {
  const main = lines.filter(line => line.uuid && !line.isSidechain);
  const byUuid = new Map(main.map(line => [line.uuid, line]));
  const chain = [];
  const seen = new Set();
  for (let line = leafUuid ? byUuid.get(leafUuid) : main.at(-1); line && !seen.has(line.uuid); line = byUuid.get(line.parentUuid ?? line.logicalParentUuid)) {
    seen.add(line.uuid);
    chain.push(line);
  }
  return chain.reverse();
}

/**
 * GUI items of one line of the chain.
 * @param {{conversation:string, lastAssistant:string|null|false, display:(line:object)=>object|null}} context lastAssistant:
 *   the answer before this line (a rewind to a user message resumes there; null: it starts the conversation, false: no
 *   answer the CLI can resume at); display: how the GUI showed a message it sent
 */
function lineItems(line, context) {
  if (line.isCompactSummary || line.isVisibleInTranscriptOnly) return []; // the summary the CLI wrote for itself
  if (line.type === 'attachment') {
    if (line.attachment?.type !== 'queued_command' || !rawText(line).trim()) return [];
    return [{ kind: 'user', text: rawText(line), correction: true, ...context.display(line) }]; // sent into a running turn
  }
  const shown = line.type === 'user' && !line.isMeta ? context.display(line) : null;
  const typed = shown || userText(line);
  if (typed) {
    return [{ ...(shown ? { kind: 'user', text: '' } : userItem(line)), ...shown, cliUuid: line.uuid, cliSession: context.conversation, afterUuid: context.lastAssistant }];
  }
  if (line.type === 'system' && line.subtype === 'local_command') {
    const output = localCommandOutput(line.content || '');
    return output ? [output] : [];
  }
  if (line.isMeta) return [];
  return translateEvent(line).filter(item => item.kind !== 'result');
}

module.exports = { listTranscripts, readTitles, appendTitle, readConversation, readSubagents, subagentItems, conversationStamp, chainOf, lineItems, rawText, titlesOf };
