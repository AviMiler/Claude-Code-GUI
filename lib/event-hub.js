/**
 * Server-sent events hub: every open browser tab receives every event on ONE stream (`/api/events`).
 * Events carry ids and are kept in a ring buffer (event-buffer.js): a tab that reconnects with `Last-Event-ID` gets
 * what it missed, or a `resync` event (reload the state) when that is no longer possible. A `: ping` comment every
 * 15 s keeps idle connections alive; a client whose socket stays blocked (a stuck tab) is dropped. A tab that names
 * itself (`?client=`) and says which sessions it views gets the item-level events of those only (sync/subscriptions.js).
 */
const { createEventBuffer } = require('./event-buffer');
const { createSubscriptions } = require('./sync/subscriptions');

const PING_MS = 15000;
const CHECK_MS = 5000;
const MAX_BLOCKED_MS = 5000;
const MAX_BLOCKED_BYTES = 4 * 1024 * 1024;

/** @param {{size?:number, now?:()=>number, timers?:boolean}} [options] timers: false in tests (call `tick` by hand) */
function createHub({ size = 300, now = Date.now, timers = true } = {}) {
  const buffer = createEventBuffer({ size });
  const clients = new Map(); // response -> { blockedSince, blockedBytes, clientId }
  const subscriptions = createSubscriptions();
  let ticks = 0;
  let timer = null;

  const frame = (id, event) => `id: ${id}\ndata: ${JSON.stringify(event)}\n\n`;

  function send(response, message) {
    const state = clients.get(response);
    if (!state) return;
    if (response.write(message) !== false) return;
    state.blockedSince ??= now();
    state.blockedBytes += Buffer.byteLength(message);
  }

  function dropIfStuck(response, state) {
    if (state.blockedSince === null) return;
    if (state.blockedBytes > MAX_BLOCKED_BYTES || now() - state.blockedSince > MAX_BLOCKED_MS) {
      clients.delete(response);
      response.destroy();
    }
  }

  /** Every CHECK_MS: drops stuck clients; every third time also pings. */
  function tick() {
    ticks++;
    for (const [response, state] of [...clients]) {
      dropIfStuck(response, state);
      if (clients.has(response) && ticks % (PING_MS / CHECK_MS) === 0) send(response, ': ping\n\n');
    }
    if (!clients.size && timer) { clearInterval(timer); timer = null; }
  }

  /** @param {string|null} [clientId] the tab's own id (sync/subscriptions.js), kept across its reconnects */
  function addClient(response, lastEventId, clientId = null) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clients.set(response, { blockedSince: null, blockedBytes: 0, clientId });
    response.on('drain', () => { const state = clients.get(response); if (state) { state.blockedSince = null; state.blockedBytes = 0; } });
    response.on('close', () => clients.delete(response));
    send(response, ': connected\n\n');
    if (lastEventId) {
      const { gap, entries } = buffer.since(lastEventId);
      if (gap) send(response, `id: ${buffer.latestId()}\nevent: resync\ndata: {}\n\n`);
      else for (const entry of entries) if (subscriptions.wants(clientId, entry.event)) send(response, frame(entry.id, entry.event));
    }
    if (timers && !timer) { timer = setInterval(tick, CHECK_MS); timer.unref?.(); }
  }

  /** @param {object} event Serialized as JSON and sent to all tabs. */
  function broadcast(event) {
    const message = frame(buffer.push(event).id, event);
    for (const [response, state] of [...clients]) if (subscriptions.wants(state.clientId, event)) send(response, message);
  }

  return { addClient, broadcast, tick, subscribe: subscriptions.set, size: () => clients.size };
}

const hub = createHub();

module.exports = { addClient: hub.addClient, broadcast: hub.broadcast, subscribe: hub.subscribe, createHub };
