/** Routes of the Terminal pane's terminals (tabs): list, open (in the session's folder or one of its folders), close. */
const { requireSession } = require('../session-common');
const { httpError } = require('../http-utils');
const { requireShellSession } = require('./shell-guard');
const { isRunning, stopRun } = require('./shell-runs');
const { listTerminals, createTerminal, removeTerminal, MAX_TERMINALS } = require('./terminals');
const { resolveTerminalFolder } = require('./terminal-folder');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });
const describe = (sessionId, terminal) => ({ id: terminal.id, n: terminal.n, cwd: terminal.cwd, running: isRunning(sessionId, terminal.id) });

const TERMINAL_TAB_ROUTES = [
  route('GET', `/api/sessions/${ID}/terminals`, ({ params }) => {
    requireSession(params[0]);
    return { max: MAX_TERMINALS, terminals: listTerminals(params[0]).map(terminal => describe(params[0], terminal)) };
  }),
  // body { folder? }: without it the terminal starts in the session's folder; with it, in that folder resolved against the session's folders
  route('POST', `/api/sessions/${ID}/terminals`, async ({ body, params }) => {
    const { folder } = await body();
    if (folder !== undefined && typeof folder !== 'string') throw httpError(400, 'נתיב התיקייה לא תקין');
    const session = requireShellSession(params[0]);
    const start = resolveTerminalFolder(session, folder ?? session.cwd); // real path, inside the session's folders
    return [201, { terminal: describe(session.id, createTerminal(session.id, start)) }];
  }),
  route('POST', `/api/sessions/${ID}/terminals/${ID}/close`, ({ params }) => {
    requireSession(params[0]);
    stopRun(params[0], params[1]); // closing a terminal ends its running command
    return { closed: removeTerminal(params[0], params[1]) };
  }),
];

module.exports = { TERMINAL_TAB_ROUTES };
