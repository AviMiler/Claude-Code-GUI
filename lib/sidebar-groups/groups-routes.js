/**
 * Routes of the sidebar's custom groups: list, create, rename, delete, reorder. Every change is broadcast as
 * `{type:'sidebar-groups', groups}` so another tab redraws at once. Deleting a group sends its sessions back to the
 * default grouping (their `groupId` is cleared and published); no session is deleted or archived.
 */
const store = require('../session-store');
const { publish } = require('../session-common');
const { broadcast } = require('../event-hub');
const { groups } = require('./index');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });
const changed = () => { const list = groups.list(); broadcast({ type: 'sidebar-groups', groups: list }); return list; };

const GROUP_ROUTES = [
  route('GET', '/api/sidebar/groups', () => ({ groups: groups.list() })),
  route('POST', '/api/sidebar/groups', async ({ body }) => { const group = groups.create((await body()).name); changed(); return [201, { group }]; }),
  route('POST', '/api/sidebar/groups/order', async ({ body }) => { groups.reorder((await body()).ids); return { groups: changed() }; }),
  route('PATCH', `/api/sidebar/groups/${ID}`, async ({ body, params }) => { const group = groups.rename(params[0], (await body()).name); changed(); return { group }; }),
  route('DELETE', `/api/sidebar/groups/${ID}`, ({ params }) => {
    groups.remove(params[0]);
    for (const session of store.list().filter(item => item.groupId === params[0])) publish(store.update(session.id, { groupId: null }));
    return { ok: true, groups: changed() };
  }),
];

module.exports = { GROUP_ROUTES };
