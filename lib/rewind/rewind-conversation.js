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
const cliSync = require('../session-cli-sync');

/** Checked before anything changes (files too): the answer to resume at is known. @throws {Error} 409 */
function requireCutPoint({ item }) {
  if (item.afterUuid !== null && !UUID.test(item.afterUuid || '')) throw httpError(409, 'אי אפשר לחזור להודעה הזאת (אין נקודת חיתוך תקינה).');
}

/**
 * The CLI resumes at the answer before the message (`resumeAt`, --resume-session-at) or starts a new conversation, and
 * the history is built again from its file (session-cli-sync.js); the GUI's own items shown from the message on go too.
 * @param {{index:number, item:object}} point @returns {Promise<void>}
 */
async function cutConversation(session, point, config) {
  const id = session.id;
  const after = point.item.afterUuid;
  const cut = new Set(session.items.slice(point.index));
  const saved = {
    claudeSessionId: session.claudeSessionId, resumeAt: session.resumeAt || null, lastAssistantUuid: session.lastAssistantUuid || null,
    lastAssistantSession: session.lastAssistantSession || null, anchors: session.anchors || [], extras: session.extras || [],
  };
  store.update(id, {
    claudeSessionId: after ? session.claudeSessionId : null, resumeAt: after || null, lastAssistantUuid: after || null,
    lastAssistantSession: after ? session.claudeSessionId : null, anchors: after ? [after] : [], extras: saved.extras.filter(extra => !cut.has(extra.item)),
  });
  try {
    runtime.close(id);
    const started = await runtime.prewarm(store.get(id), config);
    if (!await started.initialize) throw new Error('התהליך החדש לא עלה');
  } catch (error) {
    runtime.close(id);
    publish(store.update(id, saved));
    cliSync.refresh(id, { force: true });
    throw httpError(500, `החזרה נכשלה והשיחה נשארה כמו שהייתה (${error.message}). ייתכן שגרסת Claude Code לא תומכת בחזרה לנקודה קודמת.`);
  }
  cliSync.refresh(id, { force: true }); // sends the shorter history to the browsers
  publish(store.get(id));
  broadcast({ type: 'rewound', sessionId: id, keep: null });
}

module.exports = { cutConversation, requireCutPoint };
