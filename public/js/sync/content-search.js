/**
 * The text of the GUI sessions for the sidebar search, found on the server (lib/sync/session-search.js): the browser
 * holds the items of the sessions it opened only. One request per query (the box already waits for a pause in typing),
 * asked again at most every 5 s while the same query stays, so a running session's new matches show.
 */
import { api } from '../api.js';

const FRESH_MS = 5000;
let last = { query: '', hits: new Map(), at: 0 };
let asking = null; // the query being asked

/**
 * @param {string} query trimmed, non-empty
 * @param {()=>void} onChange redraws the list when the answer arrives
 * @returns {Map<string, {count:number, indexes:number[], snippet:object}>|null} by session id; null while the first
 *   answer for this query is on its way
 */
export function contentHits(query, onChange) {
  const known = last.query === query;
  if (asking !== query && (!known || Date.now() - last.at > FRESH_MS)) {
    asking = query;
    api.searchSessions(query).then(answer => {
      last = { query, hits: new Map(Object.entries(answer.hits || {})), at: Date.now() };
    }).catch(error => {
      console.error('[content-search] failed:', error.message);
      last = { query, hits: new Map(), at: Date.now() };
    }).finally(() => { if (asking === query) asking = null; onChange(); });
  }
  return known ? last.hits : null;
}
