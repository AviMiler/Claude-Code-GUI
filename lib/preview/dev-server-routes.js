/**
 * Routes of the preview pane's dev servers (user decision 2026-11-19: start only on the user's click after a
 * confirmation that shows the exact command). The request never carries a command, folder or environment: a start names
 * a configuration and the hash of what was shown; the server re-reads `.claude/launch.json` of the STORED session's folder.
 */
const { requireSession } = require('../session-common');
const { httpError } = require('../http-utils');
const { requireShellSession } = require('../terminal/shell-guard');
const { loadLaunch } = require('./launch-config');
const { startDevServer, stopDevServer, listDevServers } = require('./dev-servers');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

/**
 * What the pane shows of a configuration: the name as written, the resolved full path that runs (`program`), the
 * arguments, folder, port, url and the configuration's own variables WITH their values (the hash covers all of it).
 */
const shown = entry => ({ name: entry.name, executable: entry.executable, program: entry.program, args: entry.args,
  cwd: entry.cwd, port: entry.port, url: entry.url, env: { ...entry.env }, hash: entry.hash });

const nameOf = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw httpError(400, 'שם ההגדרה חסר או לא תקין');
  return value.trim();
};

const DEV_SERVER_ROUTES = [
  route('GET', `/api/sessions/${ID}/dev-servers`, ({ config, params }) => {
    const session = requireSession(params[0]);
    const launch = loadLaunch(session, config.port);
    return { file: launch.file, exists: launch.exists, error: launch.error, configurations: launch.configurations.map(shown),
      servers: listDevServers(session.id) };
  }),
  // body { name, hash }: the configuration as the confirmation showed it; never a command
  route('POST', `/api/sessions/${ID}/dev-servers/start`, async ({ config, body, params }) => {
    const { name, hash } = await body();
    const wanted = nameOf(name);
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) throw httpError(400, 'חסר אימות של ההגדרה שהוצגה');
    const session = requireShellSession(params[0]);
    const launch = loadLaunch(session, config.port);
    if (launch.error) throw httpError(409, launch.error);
    const entry = launch.configurations.find(item => item.name === wanted);
    if (!entry) throw httpError(404, `ההגדרה "${wanted}" לא נמצאה ב-launch.json`);
    if (entry.hash !== hash) throw httpError(409, 'הקובץ השתנה מאז שהוצג. בדוק את הפקודה שוב לפני ההפעלה.');
    return [202, { server: await startDevServer(session.id, entry, config) }];
  }),
  route('POST', `/api/sessions/${ID}/dev-servers/stop`, async ({ body, params }) => {
    const { name } = await body();
    const session = requireSession(params[0]);
    return { stopped: stopDevServer(session.id, nameOf(name)) };
  }),
];

module.exports = { DEV_SERVER_ROUTES };
