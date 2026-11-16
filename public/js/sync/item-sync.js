/**
 * Lazy items: `/api/state` brings every session's metadata only; a session's items are fetched when a pane shows it
 * (main, split, compare) and kept here afterwards. The server sends this tab the item-level events of the sessions it
 * views only (lib/sync/subscriptions.js), so a session it holds may fall behind while not viewed: opening it again, a
 * reconnect or the tab coming back fetches only the items after the ones held, or all of them when the server's
 * revision changed (a rewind, a compaction, a CLI sync: lib/sync/item-revision.js).
 * A session holds items when `session.itemsRev` is set; `session.items` is [] until then.
 */
import { api } from '../api.js';
import { state } from '../state.js';

const CLIENT = crypto.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * @param {{viewed:()=>Array<string|null>, threadsFor:(id:string)=>object[]}} view viewed: the sessions on screen;
 *   threadsFor: the threads that show a session now
 * @returns {{client:string, watch:()=>void, connected:()=>void, applyItem:(event:object)=>boolean,
 *   applyHistory:(event:object)=>void, whenLoaded:(id:string)=>Promise<void>}}
 */
export function createItemSync({ viewed, threadsFor }) {
  let sent = null; // the viewed set last told to the server, as a key
  const inflight = new Map(); // session id -> Promise of its running fetch
  const again = new Set(); // sessions to fetch once more when their running fetch ends
  const pending = new Map(); // session id -> item events that arrived during its fetch

  const ids = () => [...new Set(viewed().filter(id => id && state.sessions.has(id)))];

  /** Puts what the server answered into the session and the threads that show it. */
  function apply(session, answer) {
    if (answer.full) {
      Object.assign(session, { items: answer.items, itemsRev: answer.rev });
      threadsFor(session.id).forEach(thread => thread.show(session));
      return;
    }
    if (session.items.length < answer.from) { again.add(session.id); return; } // cannot happen with the same revision; fetch again
    const fresh = answer.items.slice(session.items.length - answer.from); // an item event may have added some already
    for (const item of fresh) {
      session.items.push(item);
      threadsFor(session.id).forEach(thread => thread.append(item, session.items.length - 1, session.items));
    }
  }

  /** Fetches what the session is missing; one fetch at a time per session. @returns {Promise<void>} */
  function sync(id) {
    if (inflight.has(id)) { again.add(id); return inflight.get(id); }
    const session = state.sessions.get(id);
    if (!session) return Promise.resolve();
    const heldRev = session.itemsRev || null;
    const running = api.items(id, heldRev, heldRev ? session.items.length : 0).then(answer => {
      const current = state.sessions.get(id);
      // A `history` event replaced the items meanwhile: it is newer than this answer.
      if (current && (current.itemsRev || null) === heldRev) apply(current, answer);
    }).catch(error => console.error('[item-sync] cannot load the items:', error.message)).finally(() => {
      inflight.delete(id);
      const queued = pending.get(id) || [];
      pending.delete(id);
      queued.forEach(event => applyItem(event));
      if (again.delete(id)) sync(id);
    });
    inflight.set(id, running);
    return running;
  }

  /**
   * An `item` event. @returns {boolean} true when it was added to the session's items (and should be drawn by the caller)
   */
  function applyItem(event) {
    const session = state.sessions.get(event.sessionId);
    if (!session) return false;
    if (inflight.has(session.id)) { pending.set(session.id, [...(pending.get(session.id) || []), event]); return false; }
    if (!session.itemsRev) return false; // not loaded: opening it fetches everything
    if (event.index === undefined) { session.items.push(event.item); return true; } // an older server
    if (event.rev === session.itemsRev && event.index < session.items.length) return false; // already held
    if (event.rev !== session.itemsRev || event.index > session.items.length) { sync(session.id); return false; }
    session.items.push(event.item);
    return true;
  }

  /** A `history` event: the items were rebuilt; a tab that does not view the session gets none (it reloads on opening). */
  function applyHistory(event) {
    const session = state.sessions.get(event.sessionId);
    if (session) Object.assign(session, { items: event.items, itemsRev: event.rev || null });
  }

  /** Tells the server the sessions on screen, then fetches what they are missing. */
  function subscribeViewed(force) {
    const list = ids();
    const key = list.join(',');
    if (!force && key === sent) return;
    const added = force ? list : list.filter(id => !(sent || '').split(',').includes(id));
    sent = key;
    api.subscribeEvents(CLIENT, list).catch(error => console.error('[item-sync] cannot subscribe:', error.message))
      .finally(() => added.forEach(sync)); // after the subscription: nothing falls between the fetch and the events
  }

  // The tab comes back: events were delivered, but a phone-like sleep may have dropped the stream for a moment.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ids().forEach(sync); });

  return {
    client: CLIENT,
    /** Called on every page refresh: a session that came on screen is subscribed to and loaded. */
    watch: () => subscribeViewed(false),
    /** The stream (re)connected or the state was reloaded: subscribe again and fetch what was missed. */
    connected: () => subscribeViewed(true),
    applyItem,
    applyHistory,
    /** Resolves when the session's items are loaded (a search hit waits for them to mark its matches). */
    whenLoaded: id => inflight.get(id) || (state.sessions.get(id)?.itemsRev ? Promise.resolve() : sync(id)),
  };
}
