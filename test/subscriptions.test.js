// Unit tests for lib/sync/subscriptions.js and its use in lib/event-hub.js: one event stream, item-level events only for
// the sessions a tab views; status and metadata for every session; replay after a reconnect filtered the same way.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createSubscriptions, isClientId } = require('../lib/sync/subscriptions');
const { createHub } = require('../lib/event-hub');

/** A fake SSE response that records what was written. */
function fakeResponse() {
  const handlers = {};
  return {
    written: [],
    writeHead() {},
    write(text) { this.written.push(text); return true; },
    on(name, handler) { handlers[name] = handler; },
    destroy() {},
    close() { handlers.close?.(); },
    events() { return this.written.filter(text => text.startsWith('id:')).map(text => JSON.parse(text.split('\ndata: ')[1])); },
  };
}

describe('createSubscriptions', () => {
  test('a tab without a subscription gets everything', () => {
    const subs = createSubscriptions();
    assert.equal(subs.wants('tab', { type: 'item', sessionId: 's1' }), true);
    assert.equal(subs.wants(null, { type: 'delta', sessionId: 's1' }), true);
  });

  test('item, history and delta only for the viewed sessions; the rest for all', () => {
    const subs = createSubscriptions();
    subs.set('tab', ['s1', 's2']);
    for (const type of ['item', 'history', 'delta']) {
      assert.equal(subs.wants('tab', { type, sessionId: 's1' }), true, type);
      assert.equal(subs.wants('tab', { type, sessionId: 's3' }), false, type);
    }
    for (const type of ['status', 'session', 'permission', 'tasks', 'shell', 'removed']) {
      assert.equal(subs.wants('tab', { type, sessionId: 's3' }), true, type);
    }
  });

  test('an empty subscription (welcome page) gets no item-level events', () => {
    const subs = createSubscriptions();
    subs.set('tab', []);
    assert.equal(subs.wants('tab', { type: 'item', sessionId: 's1' }), false);
    assert.equal(subs.wants('tab', { type: 'status', sessionId: 's1' }), true);
  });

  test('the oldest tab is forgotten past the cap (it gets everything again)', () => {
    const subs = createSubscriptions({ max: 2 });
    subs.set('a', []); subs.set('b', []); subs.set('c', []);
    assert.equal(subs.wants('a', { type: 'item', sessionId: 's' }), true);
    assert.equal(subs.wants('c', { type: 'item', sessionId: 's' }), false);
  });

  test('client ids: word characters and dashes only', () => {
    assert.equal(isClientId('3f2a-11ee_x'), true);
    for (const bad of ['', 'a b', 'a/b', 'x'.repeat(65), 7, null]) assert.equal(isClientId(bad), false);
  });
});

describe('event hub with subscriptions', () => {
  test('broadcast filters per tab; a tab without a client id gets everything', () => {
    const hub = createHub({ timers: false });
    const viewer = fakeResponse();
    const legacy = fakeResponse();
    hub.addClient(viewer, undefined, 'tab1');
    hub.addClient(legacy, undefined, null);
    hub.subscribe('tab1', ['s1']);
    hub.broadcast({ type: 'item', sessionId: 's1', item: { kind: 'text' } });
    hub.broadcast({ type: 'item', sessionId: 's2', item: { kind: 'text' } });
    hub.broadcast({ type: 'status', sessionId: 's2', status: 'idle', outcome: 'done' });
    assert.deepEqual(viewer.events().map(event => `${event.type}:${event.sessionId}`), ['item:s1', 'status:s2']);
    assert.equal(legacy.events().length, 3);
  });

  test('a reconnect replays what was missed, filtered by the subscription the tab kept', () => {
    const hub = createHub({ timers: false });
    const first = fakeResponse();
    hub.addClient(first, undefined, 'tab1');
    hub.subscribe('tab1', ['s1']);
    hub.broadcast({ type: 'status', sessionId: 's1', status: 'running' });
    const lastId = first.written.find(text => text.startsWith('id:')).split('\n')[0].slice(4);
    first.close();
    hub.broadcast({ type: 'item', sessionId: 's1', item: { kind: 'text', text: 'a' } });
    hub.broadcast({ type: 'item', sessionId: 's2', item: { kind: 'text', text: 'b' } });
    hub.broadcast({ type: 'delta', sessionId: 's2', text: 'x' });
    hub.broadcast({ type: 'status', sessionId: 's2', status: 'idle' });
    const second = fakeResponse();
    hub.addClient(second, lastId, 'tab1');
    assert.deepEqual(second.events().map(event => `${event.type}:${event.sessionId}`), ['item:s1', 'status:s2']);
  });

  test('changing the subscription takes effect at once, without reconnecting', () => {
    const hub = createHub({ timers: false });
    const tab = fakeResponse();
    hub.addClient(tab, undefined, 'tab1');
    hub.subscribe('tab1', ['s1']);
    hub.broadcast({ type: 'item', sessionId: 's2', item: {} });
    hub.subscribe('tab1', ['s2']);
    hub.broadcast({ type: 'item', sessionId: 's2', item: {} });
    hub.broadcast({ type: 'item', sessionId: 's1', item: {} });
    assert.deepEqual(tab.events().map(event => event.sessionId), ['s2']);
  });
});
