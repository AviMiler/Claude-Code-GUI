/**
 * Mid-turn corrections (Claude Code Desktop and the terminal): a message sent while Claude works goes straight to the
 * running CLI, which queues it and lets it join the turn at its next step. The CLI replays every message it takes in,
 * with its uuid (--replay-user-messages); one still waiting when the turn's result comes makes the CLI start another
 * turn, so the turn is held open until that one ends (or a fallback says it never came).
 */
const crypto = require('crypto');

const HOLD_MS = 20000; // a held turn ends anyway when no next turn shows up by then
const TURN_EVENTS = new Set(['assistant', 'stream_event']); // signs that the CLI is working on a (next) turn

/** @param {object} runtime one CLI process (session-runtime.js) @param {boolean} replays the CLI was started with --replay-user-messages */
function setUp(runtime, replays) {
  runtime.corrections = { replays, waiting: new Set(), timer: null, late: false };
}

/** Only a live turn with replays can take a correction: without them nobody could tell when it was taken in. */
const canCorrect = runtime => Boolean(runtime?.corrections.replays && runtime.turnActive && !runtime.closing && runtime.proc.isAlive());

/** @returns {string|null} the correction's uuid (the CLI's replay carries it), null when it could not be written */
function send(runtime, content) {
  const uuid = crypto.randomUUID();
  if (!runtime.proc.send(content, { uuid })) return null;
  runtime.corrections.waiting.add(uuid);
  return uuid;
}

/**
 * Every CLI event: a replay marks a correction taken in; work on a next turn ends the hold's fallback.
 * @returns {boolean} true: the CLI works on a turn after the fallback had already ended the turn (it resumes)
 */
function noteEvent(runtime, event) {
  const state = runtime.corrections;
  const replay = event.type === 'user' && event.isReplay;
  if (replay) state.waiting.delete(event.uuid);
  if (!replay && !TURN_EVENTS.has(event.type)) return false;
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  const resumed = state.late;
  state.late = false;
  return resumed;
}

/**
 * At a turn's result. @param {()=>void} endTurn ends the turn later, when the fallback fires
 * @returns {boolean} true: corrections still wait, the CLI goes on with another turn, so this result does not end the turn
 */
function holdTurn(runtime, event, endTurn) {
  const state = runtime.corrections;
  if (event.is_error || !state.waiting.size) return false; // a failed or stopped turn ends now
  state.timer = setTimeout(() => { state.timer = null; state.waiting.clear(); state.late = true; endTurn(); }, HOLD_MS);
  return true;
}

/**
 * The user stopped the turn: corrections not taken in yet are dropped from the CLI's queue (best effort).
 * @returns {Promise<string[]>} uuids of the corrections Claude never saw
 */
async function dropWaiting(runtime) {
  const state = runtime.corrections;
  clearTimeout(state.timer);
  state.timer = null;
  const waiting = [...state.waiting];
  state.waiting.clear();
  await Promise.all(waiting.map(uuid => runtime.proc.request('cancel_async_message', { message_uuid: uuid }, 3000).catch(() => null)));
  return waiting;
}

/** The process goes away: nothing more will be taken in. */
function clear(runtime) {
  if (!runtime.corrections) return;
  clearTimeout(runtime.corrections.timer);
  runtime.corrections.waiting.clear();
}

module.exports = { setUp, canCorrect, send, noteEvent, holdTurn, dropWaiting, clear };
