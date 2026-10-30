/**
 * The sidebar's "כל השיחות" search mode on the server: the text of every CLI conversation no GUI session holds (the
 * browser searches its own sessions), newest first, within a time budget. The same text as the browser's search
 * (public/js/session-search.js): typed messages, Claude's answers and tool commands; case and Hebrew points ignored.
 * Subagents' files are not searched. Each file is streamed line by line, never through the cached reader.
 */
const fs = require('fs');
const readline = require('readline');
const { userText } = require('./transcript-items');
const { listConversations } = require('./conversation-index');

const TIME_BUDGET_MS = 8000;
const MAX_HITS = 200;
const MAX_COUNTED = 99;
const SNIPPET_BEFORE = 28;
const SNIPPET_AFTER = 70;
const HEBREW_MARKS = /[֑-ׇ]/g;

/** Like session-search.js findIn: offsets in the original text, Hebrew points ignored. @returns {{start, end}|null} */
function findIn(text, target) {
  const folded = String(text).toLowerCase().replace(HEBREW_MARKS, '\u0000');
  const positions = [];
  let compact = '';
  for (let index = 0; index < folded.length; index += 1) {
    if (folded[index] !== '\u0000') { positions.push(index); compact += folded[index]; }
  }
  const hit = compact.indexOf(target);
  return hit === -1 ? null : { start: positions[hit], end: positions[hit + target.length - 1] + 1 };
}

/** The searched texts of one line: a typed message, or an answer's text and tool commands. */
function textsOf(line) {
  if (line.isSidechain || line.isMeta) return [];
  if (line.type === 'user') return [userText(line)].filter(Boolean);
  if (line.type !== 'assistant' || !Array.isArray(line.message?.content)) return [];
  return line.message.content.flatMap(block => (block.type === 'text' ? [block.text]
    : block.type === 'tool_use' && typeof block.input?.command === 'string' ? [block.input.command] : []));
}

/** @returns {Promise<{count:number, snippet:{before:string, match:string, after:string}}|null>} */
async function searchFile(file, target, deadline) {
  let count = 0;
  let snippet = null;
  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const raw of lines) {
    if (Date.now() > deadline || count >= MAX_COUNTED) break;
    if (!raw.includes('"')) continue;
    let line;
    try { line = JSON.parse(raw); } catch { continue; }
    for (const text of textsOf(line)) {
      const hit = findIn(text, target);
      if (!hit) continue;
      count += 1;
      snippet ??= {
        before: `${hit.start > SNIPPET_BEFORE ? '…' : ''}${text.slice(Math.max(0, hit.start - SNIPPET_BEFORE), hit.start)}`.replace(/\s+/g, ' '),
        match: text.slice(hit.start, hit.end), after: text.slice(hit.end, hit.end + SNIPPET_AFTER).replace(/\s+/g, ' '),
      };
    }
  }
  lines.close();
  return count ? { count, snippet } : null;
}

/**
 * @param {object} config @param {Set<string>} held conversations GUI sessions hold (not searched here) @param {string} query
 * @returns {Promise<{hits:object[], scanned:number, total:number, partial:boolean, stopped:'time'|'hits'|null}>} hits: the
 *   conversation's light row with `count` (capped at 99) and `snippet`; stopped: why not every file was read (the time
 *   budget, or 200 conversations found)
 * @example await searchConversations(config, held, 'npm test') // { hits: [{ id, cwd, title, count: 3, snippet }], scanned: 115, total: 115, partial: false }
 */
async function searchConversations(config, held, query) {
  const target = String(query || '').trim().toLowerCase().replace(HEBREW_MARKS, '');
  const { rows, total } = listConversations(config, held, { limit: Infinity });
  const deadline = Date.now() + TIME_BUDGET_MS;
  const hits = [];
  let scanned = 0;
  for (const row of rows) {
    if (!target || Date.now() > deadline || hits.length >= MAX_HITS) break;
    const found = await searchFile(row.file, target, deadline).catch(() => null);
    scanned += 1;
    if (found) hits.push({ id: row.id, cwd: row.cwd, title: row.title, updatedAt: row.updatedAt, ...found });
  }
  const stopped = !target || scanned >= total ? null : hits.length >= MAX_HITS ? 'hits' : 'time';
  return { hits, scanned, total, partial: Boolean(stopped), stopped };
}

module.exports = { searchConversations };
