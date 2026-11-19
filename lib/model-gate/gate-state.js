/**
 * The model-server gate's state: one turn at a time across sessions (one GPU; two turns together crawl and evict each
 * other's prefix cache). A session holds the slot from its turn's start until its status goes idle (session-common.js
 * `setStatus`: the real turn end, Stop, a crash, a failed start) or it is deleted; waiters are served FIFO.
 * Pure state, no session modules: session-common.js and session-runtime.js read it without a require cycle.
 * The rules (when the gate is on, what a wait looks like) are turn-gate.js.
 */
let holder = null; // session id holding the slot
const waiting = []; // { id, entry, resolve } in arrival order
let listener = () => {};

const changed = (...ids) => listener([...new Set([...waiting.map(waiter => waiter.id), ...ids])]);

/** @returns {boolean} true: the slot is free (and nobody waits before this session) and is now taken */
function take(id) {
  if (holder === id) return true;
  if (holder || waiting.length) return false;
  holder = id;
  return true;
}

/** @param {object} entry what the waiting turn would send ({ text, images, files }) @returns {Promise<boolean>} true: granted */
function wait(id, entry) {
  return new Promise(resolve => {
    waiting.push({ id, entry, resolve });
    changed(id);
  });
}

function grantNext() {
  const next = waiting.shift();
  if (next) { holder = next.id; next.resolve(true); }
  changed(...(next ? [next.id] : []));
}

/** Frees the slot if this session holds it; the next waiter gets it. */
function release(id) {
  if (holder !== id) return;
  holder = null;
  grantNext();
}

/** Takes a waiting turn out of line. @returns {object|null} its entry, null when the session was not waiting */
function cancel(id) {
  const index = waiting.findIndex(waiter => waiter.id === id);
  if (index < 0) return null;
  const [waiter] = waiting.splice(index, 1);
  waiter.resolve(false);
  changed(id);
  return waiter.entry;
}

/** The session is gone: neither its wait nor its slot may stay. */
function forget(id) {
  cancel(id);
  release(id);
}

const isWaiting = id => waiting.some(waiter => waiter.id === id);
const holderId = () => holder;

/** @returns {{place:number, text:string}|null} place 1 = next in line */
function waitOf(id) {
  const index = waiting.findIndex(waiter => waiter.id === id);
  return index < 0 ? null : { place: index + 1, text: String(waiting[index].entry.text || '').slice(0, 80) };
}

/** @param {(ids:string[])=>void} fn called with the sessions whose wait changed (to publish their meta) */
const onChange = fn => { listener = fn; };

module.exports = { take, wait, release, cancel, forget, isWaiting, holderId, waitOf, onChange };
