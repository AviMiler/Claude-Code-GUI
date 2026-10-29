/**
 * Rewinding the conversation: the transcript is cut before the message, and the CLI's conversation is resumed at the last
 * answer before it (--resume-session-at), or started again when the message was the first. The restart is checked: if the
 * new process does not come up (a CLI without the flag), everything is put back as it was.
 */
const store = require('../session-store');
const runtime = require('../session-runtime');
const { broadcast } = require('../event-hub');
const { httpError } = require('../http-utils');
const { publish } = require('../session-common');
const { UUID } = require('./rewind-points');

/** Checked before anything changes (files too): the answer to resume at is known. @throws {Error} 409 */
function requireCutPoint({ item }) {
  if (item.afterUuid !== null && !UUID.test(item.afterUuid || '')) throw httpError(409, 'אי אפשר לחזור להודעה הזאת (אין נקודת חיתוך תקינה).');
}

/** @param {{index:number, item:object}} point @returns {Promise<void>} */
async function cutConversation(session, point, config) {
  const id = session.id;
  const after = point.item.afterUuid;
  const saved = { items: session.items, claudeSessionId: session.claudeSessionId, resumeAt: session.resumeAt || null, lastAssistantUuid: session.lastAssistantUuid || null, lastAssistantSession: session.lastAssistantSession || null };
  store.update(id, { items: session.items.slice(0, point.index), claudeSessionId: after ? session.claudeSessionId : null, resumeAt: after || null, lastAssistantUuid: after || null, lastAssistantSession: after ? session.claudeSessionId : null });
  try {
    runtime.close(id);
    const started = await runtime.prewarm(store.get(id), config);
    if (!await started.initialize) throw new Error('התהליך החדש לא עלה');
  } catch (error) {
    runtime.close(id);
    publish(store.update(id, saved));
    throw httpError(500, `החזרה נכשלה והשיחה נשארה כמו שהייתה (${error.message}). ייתכן שגרסת Claude Code לא תומכת בחזרה לנקודה קודמת.`);
  }
  publish(store.get(id));
  broadcast({ type: 'rewound', sessionId: id, keep: point.index });
}

module.exports = { cutConversation, requireCutPoint };
