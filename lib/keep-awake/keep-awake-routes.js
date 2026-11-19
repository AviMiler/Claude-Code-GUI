/** GET / PUT /api/keep-awake: { enabled, active, available, reason }. PUT takes { enabled: boolean } and nothing else. */
const keepAwake = require('./index');
const { httpError } = require('../http-utils');

const KEEP_AWAKE_ROUTES = [
  { method: 'GET', pattern: /^\/api\/keep-awake$/, handler: () => keepAwake.state() },
  { method: 'PUT', pattern: /^\/api\/keep-awake$/, handler: async ({ body }) => {
    const { enabled } = await body();
    if (typeof enabled !== 'boolean') throw httpError(400, 'enabled חייב להיות true או false');
    return keepAwake.setEnabled(enabled);
  } },
];

module.exports = { KEEP_AWAKE_ROUTES };
