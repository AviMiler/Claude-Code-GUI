/** Routes of the Terminal pane and of `!` commands. They only run something when the user types it; no model call. */
const fs = require('fs');
const store = require('../session-store');
const { requireSession, requireRunnable, pushExtra } = require('../session-common');
const { httpError } = require('../http-utils');
const { SHELLS } = require('./shell-spec');
const { isRunning, startRun, stopRun } = require('./shell-runs');
const context = require('./shell-context');

const ID = '([\\w-]+)';
const MAX_COMMAND_CHARS = 8000;
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

/** The session may run a command: it exists, is not archived, and its folder is there. */
function requireShellSession(id) {
  const session = requireSession(id);
  if (session.archived) throw httpError(409, 'הסשן בארכיון. שחזר אותו כדי להריץ פקודות.');
  return requireRunnable(session);
}

async function runCommand({ config, body, params }) {
  const { command, source, shell } = await body();
  if (typeof command !== 'string' || !command.trim()) throw httpError(400, 'הפקודה ריקה');
  if (command.length > MAX_COMMAND_CHARS) throw httpError(400, `הפקודה ארוכה מדי (עד ${MAX_COMMAND_CHARS} תווים)`);
  if (!['terminal', 'bang'].includes(source)) throw httpError(400, 'מקור הפקודה לא מוכר');
  if (shell !== undefined && !SHELLS.includes(shell)) throw httpError(400, 'סוג ה-shell לא נתמך במערכת הזאת');
  const session = requireShellSession(params[0]);
  if (isRunning(session.id)) throw httpError(409, 'פקודה אחרת עדיין רצה בסשן הזה');
  const text = command.trim();
  const runId = startRun({ sessionId: session.id, command: text, shell, source, cwd: session.cwd, env: { ...process.env, ...config.env } },
    ({ runId: id, result }) => {
      if (source !== 'bang' || !fs.existsSync(session.cwd) || !store.get(session.id)) return; // the pane's commands stay in the pane
      const { stdout, stderr, exitCode, truncated, stopped, error } = result;
      pushExtra(session.id, { kind: 'shell', runId: id, command: text, stdout, stderr, exitCode, truncated, stopped, error });
      context.add(session.id, { command: text, stdout, stderr: error ? `${stderr}${error}` : stderr, exitCode: exitCode ?? 0 });
    });
  return [202, { ok: true, runId }];
}

const TERMINAL_ROUTES = [
  route('POST', `/api/sessions/${ID}/shell`, runCommand),
  route('POST', `/api/sessions/${ID}/shell/stop`, ({ params }) => { requireSession(params[0]); return { stopped: stopRun(params[0]) }; }),
];

module.exports = { TERMINAL_ROUTES };
