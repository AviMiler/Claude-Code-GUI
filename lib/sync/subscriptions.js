/**
 * Which sessions each browser tab is viewing (main pane, split pane, compare), so the ONE event stream sends a tab the
 * item-level events (items, rebuilt histories, streamed tokens) of those sessions only. Status, metadata, permission,
 * task and shell events still go to every tab: the sidebar, unread marks and notifications need every session.
 * A tab with no subscription yet gets everything (as before), so an older page keeps working.
 */
const ITEM_LEVEL = new Set(['item', 'history', 'delta']);
const CLIENT_ID = /^[\w-]{1,64}$/;
const MAX_VIEWED = 8;

/**
 * @param {{max?:number}} [options] max: tabs remembered (the oldest is forgotten; it then gets everything again)
 * @returns {{set:(clientId:string, sessionIds:string[])=>void, wants:(clientId:string|null, event:object)=>boolean}}
 * @example const subs = createSubscriptions(); subs.set('tab1', ['s1']); subs.wants('tab1', { type: 'item', sessionId: 's2' }) // false
 */
function createSubscriptions({ max = 200 } = {}) {
  const viewing = new Map(); // client id -> Set of session ids, oldest first

  return {
    set(clientId, sessionIds) {
      viewing.delete(clientId);
      viewing.set(clientId, new Set(sessionIds.slice(0, MAX_VIEWED)));
      if (viewing.size > max) viewing.delete(viewing.keys().next().value);
    },
    wants(clientId, event) {
      if (!clientId || !ITEM_LEVEL.has(event.type)) return true;
      const sessions = viewing.get(clientId);
      return !sessions || sessions.has(event.sessionId);
    },
  };
}

/** @param {unknown} value @returns {boolean} a client id a tab may use */
const isClientId = value => typeof value === 'string' && CLIENT_ID.test(value);

module.exports = { createSubscriptions, isClientId, ITEM_LEVEL };
