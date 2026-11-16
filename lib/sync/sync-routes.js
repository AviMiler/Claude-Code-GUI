/**
 * Routes of the lazy item sync: one session's items (all, or only the ones a browser is missing), which sessions a
 * tab views (the event stream's filter), and the content search over every session's items.
 */
const store = require('../session-store');
const cliSync = require('../session-cli-sync');
const { requireSession } = require('../session-common');
const { subscribe } = require('../event-hub');
const { httpError } = require('../http-utils');
const { itemsSince } = require('./item-revision');
const { isClientId } = require('./subscriptions');
const { searchSessionContents } = require('./session-search');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

const SYNC_ROUTES = [
  // ?rev=&since=: the revision and the number of items the browser holds; a revision that does not match gets them all.
  route('GET', `/api/sessions/${ID}/items`, ({ params, query }) => {
    requireSession(params[0]);
    cliSync.refresh(params[0]); // the CLI's file may have changed since the last look (at most a second ago)
    return itemsSince(store.get(params[0]), query.rev, query.since);
  }),
  // POST (origin-checked): the sessions this tab shows; their items, histories and tokens are the only ones it is sent.
  route('POST', '/api/events/subscribe', async ({ body }) => {
    const { client, sessions } = await body();
    if (!isClientId(client) || !Array.isArray(sessions)) throw httpError(400, 'בקשת מינוי לא תקינה');
    subscribe(client, sessions.filter(id => typeof id === 'string' && store.get(id)));
    return { ok: true };
  }),
  // POST (origin-checked): reads the text of every session.
  route('POST', '/api/search/sessions', async ({ body }) => searchSessionContents(store.list(), (await body()).query)),
];

module.exports = { SYNC_ROUTES };
