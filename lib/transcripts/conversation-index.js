/**
 * Every CLI conversation of every project folder (<config>/projects/<folder>/<id>.jsonl) that no GUI session holds, as
 * light rows for the sidebar: id, folder (the `cwd` its lines carry: a folder name cannot be turned back into a path),
 * title (like the /resume picker), last change and size. Read only on request, never by the 1 s sync loop; a file is read
 * again only when its size or change time moved, and only its start and end (transcript-files.js edgeLines), not through
 * the cached full reader (jsonl-reader.js), which reading every file would empty for the open sessions.
 */
const fs = require('fs');
const path = require('path');
const { configHome } = require('../claude-files');
const { edgeLines, titlesOf, projectDirs } = require('./transcript-files');

const MAX_ROWS = 500;
const cache = new Map(); // file -> { stamp, row } (row null: not a conversation the sidebar can open)

/** @returns {{file:string, dir:string, id:string, mtimeMs:number, size:number}[]} newest first */
function conversationFiles(config) {
  const root = path.join(configHome(config), 'projects');
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const folder of fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const dir = path.join(root, folder.name);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl') || !/^[\w-]+\.jsonl$/.test(entry.name)) continue;
      const file = path.join(dir, entry.name);
      const { mtimeMs, size } = fs.statSync(file);
      files.push({ file, dir, id: entry.name.slice(0, -6), mtimeMs, size });
    }
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** The row of one file, or null: no message in it, no `cwd`, or a `cwd` whose CLI folder is not this file's (import would miss it). */
function rowOf(config, entry) {
  const stamp = `${entry.mtimeMs}:${entry.size}`;
  const cached = cache.get(entry.file);
  if (cached?.stamp === stamp) return cached.row;
  let row = null;
  try {
    const lines = edgeLines(entry.file);
    const cwd = lines.find(line => typeof line.cwd === 'string' && line.cwd)?.cwd;
    if (cwd && lines.some(line => line.type === 'user' || line.type === 'assistant')) {
      const { custom, auto } = titlesOf(lines);
      row = { id: entry.id, cwd, title: custom || auto || '(ללא כותרת)', updatedAt: entry.mtimeMs, sizeBytes: entry.size };
    }
  } catch (error) {
    console.error('[conversation-index] not read:', entry.file, error.message);
  }
  cache.set(entry.file, { stamp, row });
  return row;
}

/** Its folder exists and the CLI's own lookup of that folder finds this file. */
const openable = (config, row, entry) => fs.existsSync(row.cwd) && projectDirs(config, row.cwd).some(dir => path.resolve(dir) === path.resolve(entry.dir));

/**
 * @param {object} config @param {Set<string>} held the CLI conversation ids GUI sessions hold (archived ones too)
 * @param {{limit?:number}} [options] limit: how many rows to return (the sidebar's 500 by default)
 * @returns {{rows:{id:string, cwd:string, title:string, updatedAt:number, sizeBytes:number, file:string}[], total:number}}
 *   newest first; total: every openable conversation, of which `rows` are the newest
 * @example listConversations(config, new Set(['3f2…'])).rows[0] // { id, cwd: 'C:\\work\\app', title: 'Fix login', … }
 */
function listConversations(config, held, { limit = MAX_ROWS } = {}) {
  const rows = [];
  let total = 0;
  for (const entry of conversationFiles(config)) {
    if (held.has(entry.id)) continue;
    const row = rowOf(config, entry);
    if (!row || !openable(config, row, entry)) continue;
    total += 1;
    if (rows.length < limit) rows.push({ ...row, file: entry.file });
  }
  return { rows, total };
}

module.exports = { listConversations };
