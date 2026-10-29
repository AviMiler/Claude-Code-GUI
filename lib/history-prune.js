/**
 * Drops the GUI's own items (`session.extras`) that can never show again: every CLI line one was anchored after is
 * still in the conversation files, but none is on the conversation as shown (a terminal rewind left that part behind).
 * Conservative on purpose, since a dropped item is gone: an anchor no file holds (the CLI still writing it, a deleted
 * file) keeps the item, and nothing is dropped while a rewind or a fork is not answered yet.
 */

/**
 * @param {{extras?:object[], resumeAt?:string, forkPending?:boolean, claudeSessionId?:string}} session
 * @param {{lines:object[]|null}[]} conversations every conversation read for the build (lines null: no file)
 * @param {object[][]} chains the build's chains (history-build.js buildItems)
 * @returns {object[]|null} the extras to keep, or null when none is dropped
 * @example const kept = keptExtras(session, conversations, chains); if (kept) store.update(id, { extras: kept });
 */
function keptExtras(session, conversations, chains) {
  if (session.resumeAt || session.forkPending || !session.claudeSessionId) return null;
  if (conversations.some(conversation => !conversation.lines)) return null;
  const shown = new Set(chains.flat().map(line => line.uuid));
  const inFiles = new Set(conversations.flatMap(conversation => conversation.lines.map(line => line.uuid)));
  const extras = session.extras || [];
  const kept = extras.filter(({ anchors = [] }) => !anchors.length || anchors.some(uuid => shown.has(uuid))
    || !anchors.every(uuid => inFiles.has(uuid)));
  return kept.length < extras.length ? kept : null;
}

module.exports = { keptExtras };
