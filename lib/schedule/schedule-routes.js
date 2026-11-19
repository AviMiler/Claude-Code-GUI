/**
 * Routes of the local scheduled tasks (schedule-service.js). The request never names a folder to run in: a run uses
 * the stored task's folder. The Host/Origin guard of server.js covers these like every /api route.
 */
const schedules = require('./schedule-service');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

const SCHEDULE_ROUTES = [
  route('GET', '/api/schedules', () => schedules.list()),
  route('POST', '/api/schedules', async ({ body }) => [201, await schedules.create(await body())]),
  route('POST', '/api/schedules/preview', async ({ body }) => schedules.preview(await body())),
  route('PUT', `/api/schedules/${ID}`, async ({ body, params }) => schedules.update(params[0], await body())),
  route('DELETE', `/api/schedules/${ID}`, ({ params }) => schedules.remove(params[0])),
  route('POST', `/api/schedules/${ID}/run`, ({ params }) => [202, schedules.runNow(params[0])]),
  route('POST', `/api/schedules/${ID}/active`, async ({ body, params }) => schedules.setActive(params[0], (await body()).active)),
  route('GET', `/api/schedules/${ID}/runs`, ({ params }) => schedules.runs(params[0])),
];

module.exports = { SCHEDULE_ROUTES };
