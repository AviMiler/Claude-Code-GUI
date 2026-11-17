/** Routes of the Terminal pane and of `!` commands. They only run something when the user types it; no model call. */
const fs = require('fs');
const store = require('../session-store');
const { requireSession, pushExtra } = require('../session-common');
const { httpError } = require('../http-utils');
const { SHELLS } = require('./shell-spec');
const { requireShellSession } = require('./shell-guard');
const { BANG, isRunning, startRun, stopRun } = require('./shell-runs');
const { getTerminal, startDirectory, learnCwd } = require('./terminals');
const { TERMINAL_TAB_ROUTES } = require('./terminal-tabs-routes');
const context = require('./shell-context');

const ID = '([\\w-]+)';
const MAX_COMMAND_CHARS = 8000;
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

/** After a pane command: the terminal takes the folder the shell reported (when it is a real one) and the result says where it is now. */
function settleTerminal(terminal, session, result) {
  const moved = typeof result.cwd === 'string' && !learnCwd(terminal, result.cwd, session);
  terminal.cwd = startDirectory(terminal, session); // a folder deleted meanwhile falls back to the nearest one that exists
  result.cwd = terminal.cwd;
  if (moved) result.cwdRefused = true; // the shell ended outside the session's folders: the terminal stays where it was
}

async function runCommand({ config, body, params }) {
  const { command, source, shell, terminalId } = await body();
  if (typeof command !== 'string' || !command.trim()) throw httpError(400, 'הפקודה ריקה');
  if (command.length > MAX_COMMAND_CHARS) throw httpError(400, `הפקודה ארוכה מדי (עד ${MAX_COMMAND_CHARS} תווים)`);
  if (!['terminal', 'bang'].includes(source)) throw httpError(400, 'מקור הפקודה לא מוכר');
  if (shell !== undefined && !SHELLS.includes(shell)) throw httpError(400, 'סוג ה-shell לא נתמך במערכת הזאת');
  const session = requireShellSession(params[0]);
  const terminal = source === 'terminal' ? getTerminal(session.id, terminalId) : null;
  if (source === 'terminal' && !terminal) throw httpError(404, 'הטרמינל לא נמצא. פתח טרמינל חדש.');
  if (isRunning(session.id, terminal?.id || BANG)) throw httpError(409, 'פקודה אחרת עדיין רצה בטרמינל הזה');
  const text = command.trim();
  const cwd = terminal ? startDirectory(terminal, session) : session.cwd; // the folder is the terminal's own or the session's, never the request's
  const runId = startRun({ sessionId: session.id, terminalId: terminal?.id, command: text, shell, source, cwd, env: { ...process.env, ...config.env } },
    ({ runId: id, result }) => {
      if (terminal) settleTerminal(terminal, session, result);
      if (source !== 'bang' || !fs.existsSync(session.cwd) || !store.get(session.id)) return; // the pane's commands stay in the pane
      const { stdout, stderr, exitCode, truncated, stopped, error } = result;
      pushExtra(session.id, { kind: 'shell', runId: id, command: text, stdout, stderr, exitCode, truncated, stopped, error });
      context.add(session.id, { command: text, stdout, stderr: error ? `${stderr}${error}` : stderr, exitCode: exitCode ?? 0 });
    });
  return [202, { ok: true, runId }];
}

const TERMINAL_ROUTES = [
  route('POST', `/api/sessions/${ID}/shell`, runCommand),
  // body { terminalId? }: a pane terminal's command, or (without it) the `!` command of the composer
  route('POST', `/api/sessions/${ID}/shell/stop`, async ({ body, params }) => {
    const { terminalId } = await body();
    requireSession(params[0]);
    return { stopped: stopRun(params[0], typeof terminalId === 'string' ? terminalId : BANG) };
  }),
  ...TERMINAL_TAB_ROUTES,
];

module.exports = { TERMINAL_ROUTES };
