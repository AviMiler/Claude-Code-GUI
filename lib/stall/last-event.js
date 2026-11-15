/**
 * When each session's CLI last reported anything (any stream-json event, `stream_event` deltas included), for the
 * browser's stall line ("N שניות מאז הטוקן האחרון", public/js/stall/). Fed by one hook in runtime-events.js
 * `handleMessage`. Many CLI events never reach the browser (a tool call's input streaming), so a throttled SSE
 * `alive` event tells it the CLI still talks; the session meta's `lastEventAt` covers a tab opened mid-turn.
 */
const { broadcast } = require('../event-hub');

const ALIVE_EVERY_MS = 5000;
const last = new Map(); // session id (a spare's `spare-…` too) -> { at, sentAt }

/** @param {string} sessionId the runtime's current session id */
function touch(sessionId) {
  const now = Date.now();
  const entry = last.get(sessionId) || { at: 0, sentAt: 0 };
  entry.at = now;
  last.set(sessionId, entry);
  if (now - entry.sentAt < ALIVE_EVERY_MS) return;
  entry.sentAt = now;
  broadcast({ type: 'alive', sessionId, at: now });
}

/** @returns {number|null} ms timestamp of the session's last CLI event since the server started */
const at = sessionId => last.get(sessionId)?.at || null;

const forget = sessionId => last.delete(sessionId);

module.exports = { touch, at, forget };
