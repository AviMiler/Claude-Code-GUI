/**
 * Revisions of a session's item list, so a browser that already holds the items can fetch only what was added.
 * Appending an item keeps the revision; rebuilding the list (a CLI file sync, a rewind, a compaction: the `history`
 * event) gives it a new one. The epoch changes with every server start, so a revision from an older run never matches.
 */
const EPOCH = Date.now().toString(36);
const counters = new Map(); // session id -> number of rebuilds

/** @param {string} id @returns {string} the session's current revision, `<epoch>.<n>` */
const revOf = id => `${EPOCH}.${counters.get(id) || 0}`;

/** The item list was rewritten. @param {string} id @returns {string} the new revision */
function bump(id) {
  counters.set(id, (counters.get(id) || 0) + 1);
  return revOf(id);
}

/** A deleted session's counter goes too. @param {string} id */
const forget = id => counters.delete(id);

/**
 * What a browser holding `since` items of revision `rev` is missing.
 * @param {{id:string, items:object[]}} session
 * @param {string|undefined} rev the revision the browser holds (none: it holds nothing)
 * @param {string|number|undefined} since how many items it holds
 * @returns {{rev:string, from:number, items:object[], total:number, full:boolean}} full: the whole list (the revision
 *   did not match, or `since` is past the end); otherwise the items from index `from` on
 * @example itemsSince(session, '1a2b.0', 12) // { rev: '1a2b.0', from: 12, items: [ ...2 new ], total: 14, full: false }
 */
function itemsSince(session, rev, since) {
  const current = revOf(session.id);
  const items = session.items || [];
  const held = Number(since);
  if (rev === current && Number.isInteger(held) && held >= 0 && held <= items.length) {
    return { rev: current, from: held, items: items.slice(held), total: items.length, full: false };
  }
  return { rev: current, from: 0, items, total: items.length, full: true };
}

module.exports = { revOf, bump, forget, itemsSince };
