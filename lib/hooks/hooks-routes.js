/** Routes of the hook form: the folder always comes from the session (by id), never from the request. */
const { requireSession } = require('../session-common');
const store = require('./hooks-store');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });
const folder = id => requireSession(id).cwd;
const num = value => (value === undefined ? undefined : Number(value));

const HOOKS_ROUTES = [
  route('GET', `/api/sessions/${ID}/hooks`, ({ config, params }) => store.listHooks(config, folder(params[0]))),
  route('POST', `/api/sessions/${ID}/hooks`, async ({ config, params, body }) => [201, store.addHook(config, folder(params[0]), await body())]),
  route('PUT', `/api/sessions/${ID}/hooks`, async ({ config, params, body }) => store.updateHook(config, folder(params[0]), await body())),
  route('DELETE', `/api/sessions/${ID}/hooks`, ({ config, params, query }) =>
    store.deleteHook(config, folder(params[0]), { ...query, groupIndex: num(query.groupIndex), hookIndex: num(query.hookIndex) })),
];

module.exports = { HOOKS_ROUTES };
