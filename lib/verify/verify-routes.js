/**
 * Routes of the automatic check (verify loop): the stored check of the session's project folder (GET / PUT / DELETE;
 * the folder always comes from the session, never from the request), and the Stop hook's question (POST verify-hook,
 * answered only with the CLI process's secret).
 */
const { requireSession } = require('../session-common');
const { httpError } = require('../http-utils');
const { getCapabilities, hasFlag } = require('../cli-capabilities');
const { SHELLS, DEFAULT_SHELL } = require('../terminal/shell-spec');
const { projectFolder, getCheck, validCheck, setCheck, clearCheck } = require('./verify-store');
const { unavailableReason } = require('./verify-hook-settings');
const secrets = require('./verify-secrets');
const { decide } = require('./verify-hook');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

/** What the settings section shows: the check, and whether this CLI / machine can run the hook at all. */
async function describe(session, config) {
  const capabilities = await getCapabilities(config);
  const reason = !hasFlag(capabilities, '--settings') ? 'לא זמין בגרסת ה-CLI הזו (אין --settings).' : unavailableReason();
  return { folder: projectFolder(session), check: getCheck(projectFolder(session)), available: !reason, reason, shells: SHELLS, defaultShell: DEFAULT_SHELL, maxAttempts: config.verifyMaxAttempts };
}

async function hook({ config, params, headers, body }) {
  await body().catch(() => ({})); // the hook's stdin JSON: read, not needed (the server's own state decides)
  const sessionId = secrets.resolve(params[0], headers['x-verify-secret']);
  if (!sessionId) throw httpError(403, 'forbidden');
  return decide(sessionId, config);
}

const VERIFY_ROUTES = [
  route('GET', `/api/sessions/${ID}/verify-check`, ({ config, params }) => describe(requireSession(params[0]), config)),
  route('PUT', `/api/sessions/${ID}/verify-check`, async ({ config, params, body }) => {
    const session = requireSession(params[0]);
    setCheck(projectFolder(session), validCheck(await body()));
    return describe(session, config);
  }),
  route('DELETE', `/api/sessions/${ID}/verify-check`, ({ config, params }) => {
    const session = requireSession(params[0]);
    clearCheck(projectFolder(session));
    return describe(session, config);
  }),
  route('POST', `/api/sessions/${ID}/verify-hook`, hook),
];

module.exports = { VERIFY_ROUTES };
