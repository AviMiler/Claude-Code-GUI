/**
 * The model-server gate's rules (`config.modelGate`: true | false | "auto", auto = on only for a custom, non-Anthropic
 * ANTHROPIC_BASE_URL). Called by `startTurn` (session-messages.js), so every message path is gated the same way; a
 * waiting turn has not reached the CLI: its session shows "running" with `modelWait: { place, text }` in its meta, and
 * Stop takes it back out of line (returned to the composer like the queue). Not gated: `/btw`, mid-turn corrections,
 * the warm-up (none of them goes through startTurn). The gate gates turns, not requests: a turn's subagents still run
 * together. State and release rules: gate-state.js.
 */
const crypto = require('crypto');
const store = require('../session-store');
const { broadcast } = require('../event-hub');
const { envOf, isAnthropic } = require('../model-list');
const gate = require('./gate-state');
const { publish, pushExtra, setStatus } = require('../session-common');

gate.onChange(ids => ids.forEach(id => store.get(id) && publish(store.get(id))));

/** @returns {boolean} */
function gateOn(config) {
  const setting = config.modelGate ?? 'auto';
  if (typeof setting === 'boolean') return setting;
  const baseUrl = envOf(config, 'ANTHROPIC_BASE_URL');
  return Boolean(baseUrl) && !isAnthropic(baseUrl);
}

/**
 * A holder that is gone, no longer running, or archived (archive stops its turn) would block everyone: free its slot
 * first. Normally `setStatus` has already released it.
 */
function dropStaleHolder() {
  const holder = gate.holderId();
  const session = holder && store.get(holder);
  if (holder && (!session || session.status !== 'running' || session.archived)) {
    console.error('[model-gate] releasing a stale slot of', holder);
    gate.release(holder);
  }
}
setInterval(dropStaleHolder, 30000).unref(); // waiters would otherwise wait for a newcomer to notice

/**
 * A turn asks for the model. Synchronous, so `startTurn` still marks the session running before anything else can send
 * to it. When the slot is taken the session shows running and waits in line; the HTTP request that sent the message
 * does not wait with it.
 * @param {{text:string, images:object[], files:object[]}} entry what the turn sends (returned on Stop)
 * @param {()=>Promise<void>} start starts the turn again once granted (enter then finds the slot its own)
 * @returns {boolean} true: start the turn now; false: it waits (and `start` runs when granted, never when cancelled)
 * @example if (!enter(id, entry, config, () => startTurn(id, text, config))) return;
 */
function enter(id, entry, config, start) {
  if (!gateOn(config)) return true;
  dropStaleHolder();
  if (gate.take(id)) return true;
  setStatus(id, 'running');
  gate.wait(id, entry).then(granted => {
    if (!granted) return undefined;
    broadcast({ type: 'status', sessionId: id, status: 'running' }); // the real turn starts now: browsers restart its clock
    return start();
  }).catch(error => console.error('[model-gate] waiting turn failed:', error));
  return false;
}

/** Stop while waiting. @returns {object|null} the entry that never started (null: the session was not waiting) */
function cancel(id) {
  const entry = gate.cancel(id);
  if (!entry) return null;
  pushExtra(id, { kind: 'notice', text: 'ההודעה לא נשלחה: ההמתנה לשרת המודל בוטלה.', stopped: true });
  setStatus(id, 'idle');
  return entry;
}

/** Archive while waiting: the message goes to the front of the (paused) queue, so a restore can still send it. */
function requeue(id) {
  const entry = gate.cancel(id);
  if (!entry) return;
  const session = store.get(id);
  publish(store.update(id, { queue: [{ id: crypto.randomUUID(),...entry, at: Date.now() }, ...(session.queue || [])] }));
  setStatus(id, 'idle');
}

module.exports = { enter, cancel, requeue, gateOn };
