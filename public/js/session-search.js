/** Full-text search over every session's messages (user messages, Claude's answers, shell commands) for the sidebar. */

const SNIPPET_BEFORE = 28;
const SNIPPET_AFTER = 70;
const MAX_ITEMS_SCANNED = 3000; // newest items of a session; keeps typing fast in very long conversations
const MAX_COUNTED = 99;
// Hebrew points and cantillation marks: "שָׁלוֹם" should match "שלום".
const HEBREW_MARKS = /[֑-ׇ]/g;

/** Lower-cases and drops Hebrew points, keeping one character per character so offsets still map back. */
const fold = text => String(text).toLowerCase().replace(HEBREW_MARKS, '\u0000');

/** The searchable text of an item, or '' for kinds that are not searched (thinking, tool results, notices…). */
export function searchableText(item) {
  if (item.kind === 'user' || item.kind === 'text') return item.text || '';
  if (item.kind === 'tool' && typeof item.input?.command === 'string') return item.input.command;
  return '';
}

/**
 * Finds where `needle` occurs in `text`, ignoring case and Hebrew points.
 * @returns {{start:number, end:number}|null} offsets in the original text (points inside the match included)
 */
function findIn(text, needle) {
  const folded = fold(text);
  const target = fold(needle).replace(/\u0000/g, '');
  // Points became NUL; search with them removed, then map the hit back to the original offsets.
  const positions = [];
  let compact = '';
  for (let index = 0; index < folded.length; index += 1) {
    if (folded[index] !== '\u0000') { positions.push(index); compact += folded[index]; }
  }
  const hit = target ? compact.indexOf(target) : -1;
  return hit === -1 ? null : { start: positions[hit], end: positions[hit + target.length - 1] + 1 };
}

/**
 * @typedef {object} SearchResult
 * @property {number} count       matching items (capped at 99)
 * @property {number[]} indexes   item indexes that match, in conversation order
 * @property {{before:string, match:string, after:string}|null} snippet  around the first match
 */

/**
 * Searches one session's items.
 * @param {object[]} items
 * @param {string} query trimmed, non-empty
 * @returns {SearchResult|null} null when nothing matches
 * @example searchItems(session.items, 'npm test')
 */
export function searchItems(items, query) {
  const indexes = [];
  let snippet = null;
  const first = Math.max(0, items.length - MAX_ITEMS_SCANNED);
  for (let index = first; index < items.length; index += 1) {
    const text = searchableText(items[index]);
    if (!text) continue;
    const hit = findIn(text, query);
    if (!hit) continue;
    indexes.push(index);
    if (!snippet) {
      const { start, end } = hit;
      snippet = {
        before: `${start > SNIPPET_BEFORE ? '…' : ''}${text.slice(Math.max(0, start - SNIPPET_BEFORE), start)}`.replace(/\s+/g, ' '),
        match: text.slice(start, end),
        after: text.slice(end, end + SNIPPET_AFTER).replace(/\s+/g, ' '),
      };
    }
  }
  return indexes.length ? { count: Math.min(indexes.length, MAX_COUNTED), indexes, snippet } : null;
}

/**
 * Searches every session. Name/folder matches are reported too, so the sidebar keeps its old filter.
 * @param {Iterable<object>} sessions
 * @param {string} query
 * @returns {Map<string, {byName:boolean, content:SearchResult|null}>} only sessions that match
 */
export function searchSessions(sessions, query) {
  const needle = query.trim();
  const results = new Map();
  if (!needle) return results;
  for (const session of sessions) {
    const byName = Boolean(findIn(`${session.name} ${session.cwd}`, needle));
    const content = searchItems(session.items || [], needle);
    if (byName || content) results.set(session.id, { byName, content });
  }
  return results;
}
