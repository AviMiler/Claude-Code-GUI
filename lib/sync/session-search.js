/**
 * The sidebar's "תוכן הסשנים" search on the server: the browser holds the items of the sessions it opened only (lazy
 * loading), so the text of every GUI session is searched here, over the items the server builds from the CLI's files.
 * The same text, normalization and limits as before in the browser (public/js/session-search.js): typed messages,
 * Claude's answers and shell commands; case and Hebrew points ignored; the newest 3000 items; at most 99 counted.
 */
const { findIn, foldQuery, snippetAt, MAX_COUNTED } = require('../transcripts/conversation-search');

const MAX_ITEMS_SCANNED = 3000;
const MAX_QUERY = 500;

/** The searched text of an item, or '' for kinds that are not searched (thinking, tool results, notices…). */
function searchableText(item) {
  if (item.kind === 'user' || item.kind === 'text') return item.text || '';
  if (item.kind === 'tool' && typeof item.input?.command === 'string') return item.input.command;
  return '';
}

/**
 * @param {object[]} items one session's items @param {string} target a folded query (foldQuery)
 * @returns {{count:number, indexes:number[], snippet:{before:string, match:string, after:string}}|null} indexes: the
 *   matching items' positions in the list, for the "k מתוך N" bar
 */
function searchItems(items, target) {
  const indexes = [];
  let snippet = null;
  for (let index = Math.max(0, items.length - MAX_ITEMS_SCANNED); index < items.length; index += 1) {
    const text = searchableText(items[index]);
    const hit = text && findIn(text, target);
    if (!hit) continue;
    indexes.push(index);
    snippet ??= snippetAt(text, hit);
  }
  return indexes.length ? { count: Math.min(indexes.length, MAX_COUNTED), indexes, snippet } : null;
}

/**
 * @param {{id:string, items:object[]}[]} sessions every GUI session (archived too: the browser filters by the list shown)
 * @param {string} query
 * @returns {{query:string, hits:Object<string, {count:number, indexes:number[], snippet:object}>}} by session id, only
 *   sessions whose content matches
 * @example searchSessionContents(store.list(), 'npm test') // { query: 'npm test', hits: { 'a1…': { count: 2, indexes: [3, 9], snippet } } }
 */
function searchSessionContents(sessions, query) {
  const text = String(query || '').slice(0, MAX_QUERY);
  const target = foldQuery(text);
  const hits = {};
  if (!target) return { query: text, hits };
  for (const session of sessions) {
    const found = searchItems(session.items || [], target);
    if (found) hits[session.id] = found;
  }
  return { query: text, hits };
}

module.exports = { searchSessionContents, searchItems };
