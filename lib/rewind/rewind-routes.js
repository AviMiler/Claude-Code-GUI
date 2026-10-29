/** Routes of rewind. The body carries a message uuid and a mode, never a path: the files are restored by the CLI itself. */
const { previewRewind, rewind } = require('./rewind-service');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

const REWIND_ROUTES = [
  route('POST', `/api/sessions/${ID}/rewind/preview`, async ({ config, body, params }) => previewRewind(params[0], (await body()).uuid, config)),
  route('POST', `/api/sessions/${ID}/rewind`, async ({ config, body, params }) => rewind(params[0], await body(), config)),
];

module.exports = { REWIND_ROUTES };
