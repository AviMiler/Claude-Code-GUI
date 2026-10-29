/** Which user messages a session can go back to, and the checks before it happens. */
const { httpError } = require('../http-utils');
const { requireRunnable } = require('../session-common');
const runtime = require('../session-runtime');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nothing is running that a rewind would disturb. @throws {Error} 409 with the reason */
function requireRewindable(session) {
  if (session.archived) throw httpError(409, 'הסשן בארכיון. שחזר אותו כדי לחזור לנקודה קודמת.');
  requireRunnable(session);
  if (session.status === 'running') throw httpError(409, 'Claude עובד כרגע. עצור את הריצה ורק אז חזור לנקודה קודמת.');
  if (runtime.pendingFor(session.id).length) throw httpError(409, 'יש בקשה שממתינה לתשובה. ענה עליה קודם.');
  return session;
}

/**
 * The user message with this uuid, if it is a point of the CLI's current conversation: one the CLI replayed in it (a message
 * before a /clear, a fork or an imported chat belongs to another conversation).
 * @returns {{index:number, item:object}}
 */
function findPoint(session, uuid) {
  if (typeof uuid !== 'string' || !UUID.test(uuid)) throw httpError(400, 'מזהה הודעה לא תקין');
  const index = session.items.findIndex(item => item.kind === 'user' && !item.correction && item.cliUuid === uuid);
  if (index < 0) throw httpError(404, 'ההודעה לא נמצאה בשיחה');
  const item = session.items[index];
  if (!session.claudeSessionId || session.forkPending || item.cliSession !== session.claudeSessionId) {
    throw httpError(409, 'אי אפשר לחזור להודעה הזאת: היא שייכת לשיחה אחרת של Claude (לפני ניקוי, פיצול או ייבוא).');
  }
  return { index, item };
}

module.exports = { UUID, requireRewindable, findPoint };
