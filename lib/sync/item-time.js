/**
 * When a message was written: the `at` field (ms) of a user message and of Claude's answer text. Built from the CLI
 * conversation file's ISO `timestamp` on each line; an item the GUI shows live, before the file is read again, gets the
 * time the server received it. The browser shows it beside the copy button (public/js/transcript/message-time.js).
 */

const TIMED = new Set(['user', 'text']);

/**
 * @param {object} line a line of a CLI conversation file
 * @returns {number|undefined} its time in ms, or undefined when it has none or it cannot be read
 * @example lineTime({ timestamp: '2026-11-19T10:00:00.000Z' }) // 1795082400000
 */
function lineTime(line) {
  if (typeof line?.timestamp !== 'string') return undefined;
  const ms = Date.parse(line.timestamp);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * The line's time on its user and text items (the others are left as they are).
 * @param {object[]} items the items of one line @param {object} line
 * @returns {object[]}
 */
function withLineTime(items, line) {
  const at = lineTime(line);
  if (at === undefined) return items;
  return items.map(item => (TIMED.has(item.kind) ? { ...item, at } : item));
}

/**
 * A live user or text item gets the time it was received, unless it has one. Changes the item in place (other code
 * holds it by reference, session-events.js onUserReplay).
 * @param {object} item @param {number} [now] @returns {object} the same item
 */
function stampNow(item, now = Date.now()) {
  if (TIMED.has(item.kind) && item.at === undefined) item.at = now;
  return item;
}

/**
 * The item without its time, for comparing a list built from the file with the one that arrived live: the two times
 * differ by moments, which is no reason for a new revision (session-cli-sync.js).
 * @param {object} item @returns {object}
 */
function withoutTime(item) {
  if (!item || item.at === undefined) return item;
  const { at, ...rest } = item;
  return rest;
}

module.exports = { lineTime, withLineTime, stampNow, withoutTime };
