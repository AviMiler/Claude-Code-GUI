/** JSON + SSE API consumed by public/. Routes are a flat table: [method, pattern, handler]. */
const service = require('./session-service');
const { addClient } = require('./event-hub');
const { getCapabilities } = require('./cli-capabilities');
const { httpError, sendJson, readJson } = require('./http-utils');
const { TOOL_ROUTES } = require('./api-routes-tools');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

const SESSION_ROUTES = [
  route('GET', '/api/state', async ({ config }) => ({
    sessions: service.listSessions(),
    config: { defaultCwd: config.defaultCwd, claudePath: config.claudePath, model: config.model },
    capabilities: await getCapabilities(config),
  })),
  route('POST', '/api/sessions', async ({ config, body }) => [201, service.createSession(await body(), config)]),
  route('PATCH', `/api/sessions/${ID}`, async ({ config, body, params }) => service.updateSession(params[0], await body(), config)),
  route('DELETE', `/api/sessions/${ID}`, ({ params }) => { service.deleteSession(params[0]); return { ok: true }; }),
  route('POST', `/api/sessions/${ID}/messages`, async ({ config, body, params }) => {
    await service.sendMessage(params[0], (await body()).text, config);
    return [202, { ok: true }];
  }),
  route('POST', `/api/sessions/${ID}/stop`, async ({ params }) => ({ stopped: await service.stopSession(params[0]) })),
  route('POST', `/api/sessions/${ID}/clear`, ({ params }) => { service.clearConversation(params[0]); return { ok: true }; }),
  route('POST', `/api/sessions/${ID}/fork`, ({ config, params }) => [201, service.forkSession(params[0], config)]),
  route('POST', `/api/sessions/${ID}/permissions/([\\w.:-]+)`, async ({ body, params }) =>
    service.answerPermission(params[0], params[1], await body())),
];

const ROUTES = [...SESSION_ROUTES, ...TOOL_ROUTES];

/**
 * Routes one /api/* request. Throws httpError for client mistakes (handled by server.js).
 * @param {import('http').IncomingMessage} request
 * @param {import('http').ServerResponse} response
 * @param {object} config
 */
async function handleApi(request, response, config) {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/api/events') return addClient(response);
  const candidates = ROUTES.filter(entry => entry.pattern.test(url.pathname));
  if (!candidates.length) throw httpError(404, 'נתיב לא קיים');
  const matched = candidates.find(entry => entry.method === request.method);
  if (!matched) throw httpError(405, 'שיטה לא נתמכת');
  const params = url.pathname.match(matched.pattern).slice(1);
  const query = Object.fromEntries(url.searchParams);
  const result = await matched.handler({ config, params, query, body: () => readJson(request) });
  // A handler returns either the body, or [status, body] to choose the status code.
  const withStatus = Array.isArray(result) && result.length === 2 && typeof result[0] === 'number';
  const [status, payload] = withStatus ? result : [200, result];
  sendJson(response, status, payload);
}

module.exports = { handleApi };
