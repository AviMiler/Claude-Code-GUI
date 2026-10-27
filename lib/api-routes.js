/** JSON + SSE API consumed by public/. Routes are a flat table: [method, pattern, handler]. */
const service = require('./session-service');
const archive = require('./session-archive');
const sideQuestions = require('./side-questions');
const { addClient } = require('./event-hub');
const { getCapabilities } = require('./cli-capabilities');
const { httpError, sendJson, readJson } = require('./http-utils');
const { TOOL_ROUTES } = require('./api-routes-tools');
const { serveImage } = require('./images');
const { serveUpload } = require('./uploads');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

const SESSION_ROUTES = [
  route('GET', '/api/state', async ({ config }) => ({
    sessions: service.listSessions(),
    config: { defaultCwd: config.defaultCwd, claudePath: config.claudePath, model: config.model },
    capabilities: await getCapabilities(config),
  })),
  route('POST', '/api/warm', async ({ config, body }) => { service.warm(await body(), config); return [202, { ok: true }]; }),
  route('POST', '/api/sessions', async ({ config, body }) => [201, await service.startSession(await body(), config)]),
  route('PATCH', `/api/sessions/${ID}`, async ({ config, body, params }) => service.updateSession(params[0], await body(), config)),
  // ?worktree=remove: also remove the session's worktree folder (its branch stays).
  route('DELETE', `/api/sessions/${ID}`, async ({ params, query }) =>
    ({ ok: true, ...await service.deleteSession(params[0], { removeWorktree: query.worktree === 'remove' }) })),
  route('POST', `/api/sessions/${ID}/messages`, async ({ config, body, params }) => {
    const { text, images, files } = await body();
    await archive.restoreForMessage(params[0]);
    return [202, { ok: true, ...await service.sendMessage(params[0], text, config, images, files) }];
  }),
  route('POST', `/api/sessions/${ID}/stop`, ({ params }) => service.stopSession(params[0])),
  route('DELETE', `/api/sessions/${ID}/queue/${ID}`, ({ params }) => { service.removeQueued(params[0], params[1]); return { ok: true }; }),
  route('POST', `/api/sessions/${ID}/queue/resume`, async ({ config, params }) => {
    await archive.restoreForMessage(params[0]); // "send the next" on an archived session restores it first, like sending
    service.resumeQueue(params[0], config);
    return { ok: true };
  }),
  route('POST', `/api/sessions/${ID}/archive`, ({ params }) => archive.archiveSession(params[0])),
  route('POST', `/api/sessions/${ID}/unarchive`, ({ params }) => archive.unarchiveSession(params[0])),
  route('POST', `/api/sessions/${ID}/clear`, ({ params }) => { service.clearConversation(params[0]); return { ok: true }; }),
  route('POST', `/api/sessions/${ID}/fork`, ({ config, params }) => [201, service.forkSession(params[0], config)]),
  route('POST', `/api/sessions/${ID}/side-question`, async ({ config, body, params }) => sideQuestions.ask(params[0], await body(), config)),
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
  const image = request.method === 'GET' && url.pathname.match(/^\/api\/images\/([^/]+)$/);
  if (image) return serveImage(response, image[1]); // raw bytes, not JSON
  const upload = request.method === 'GET' && url.pathname.match(/^\/api\/uploads\/([^/]+)\/([^/]+)$/);
  if (upload) return serveUpload(response, upload[1], decodeURIComponent(upload[2]));
  const candidates = ROUTES.filter(entry => entry.pattern.test(url.pathname));
  // After an update, public/ is new at once but routes load only at startup: say so instead of a bare 404.
  if (!candidates.length) throw httpError(404, `נתיב API לא קיים: ${url.pathname}. אם הקוד עודכן – צריך להפעיל מחדש את השרת (node server.js).`);
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
