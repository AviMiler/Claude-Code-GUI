/** Routes of the Changes pane's commit box. The folder is always the session's own; the bodies carry the message and the ticked paths only. */
const { requireSession } = require('../session-common');
const { commitStatus } = require('./commit-status');
const { commitChanges } = require('./commit');
const { pushBranch } = require('./push');
const fs = require('fs');
const { httpError } = require('../http-utils');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

/** The session; its folder must exist (an archived session's removed worktree is a 409). */
function runnable(id) {
  const session = requireSession(id);
  if (!fs.existsSync(session.cwd)) throw httpError(409, `תיקיית הסשן לא קיימת: ${session.cwd}`);
  return session;
}

const COMMIT_ROUTES = [
  route('GET', `/api/sessions/${ID}/git/status`, ({ params }) => {
    const session = requireSession(params[0]);
    return fs.existsSync(session.cwd) ? commitStatus({ cwd: session.cwd }) : { isRepo: false, folderMissing: true };
  }),
  // POST: the server's Host / Origin guard covers every write route.
  route('POST', `/api/sessions/${ID}/git/commit`, async ({ params, body }) => commitChanges(runnable(params[0]), await body())),
  route('POST', `/api/sessions/${ID}/git/push`, async ({ params, body }) => pushBranch(runnable(params[0]), await body())),
];

module.exports = { COMMIT_ROUTES };
