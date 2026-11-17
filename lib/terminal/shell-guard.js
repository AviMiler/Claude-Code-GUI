/** The checks every route that runs something in a session's folder has in common. */
const { requireSession, requireRunnable } = require('../session-common');
const { httpError } = require('../http-utils');

/** The session may run a command: it exists, is not archived, and its folder is there. */
function requireShellSession(id) {
  const session = requireSession(id);
  if (session.archived) throw httpError(409, 'הסשן בארכיון. שחזר אותו כדי להריץ פקודות.');
  return requireRunnable(session);
}

module.exports = { requireShellSession };
