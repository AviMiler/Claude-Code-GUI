/**
 * When each session last heard from its CLI, for the working line's stall note (stall-note.js). Fed by every live event
 * of the session (events.js), the server's throttled `alive` event and the meta's `lastEventAt` (lib/stall/last-event.js),
 * which count CLI events the browser never sees (a tool call's input streaming) and cover a tab opened mid-turn.
 * The clock does not run while the session waits on the user (permission), on a held turn (a correction's result came,
 * the turn goes on), on an automatic check (`verifying`) or for the model server (`modelWait`): pausing = "heard now".
 */
import { state } from '../state.js';

/** Window event fired once per stall (model-health.js rechecks the model server). */
export const STALL_EVENT = 'claude-gui:stall';
const DEFAULT_SECONDS = 60;
const COUNTED = new Set(['item', 'delta', 'runtime', 'tasks', 'permission', 'permission-resolved', 'status', 'alive']);
const clocks = new Map(); // session id -> { at, held, stalled }

function clockOf(id) {
  if (!clocks.has(id)) clocks.set(id, { at: state.sessions.get(id)?.lastEventAt || Date.now(), held: false, stalled: false });
  return clocks.get(id);
}

/** Every SSE event (events.js), before it is applied. */
export function noteStallEvent(event) {
  if (event.type === 'session') {
    const { id, lastEventAt } = event.session;
    if (lastEventAt && clocks.has(id)) clockOf(id).at = Math.max(clockOf(id).at, lastEventAt);
    return;
  }
  if (!event.sessionId || !COUNTED.has(event.type)) return;
  const clock = clockOf(event.sessionId);
  clock.at = Date.now();
  // A successful result while the session stays running is a held turn (a late correction): no stall until it goes on.
  if (event.type !== 'alive') clock.held = event.type === 'item' && event.item.kind === 'result' && !event.item.isError;
}

/**
 * @param {string} id session id @param {boolean} waiting a permission / elicitation prompt is pending
 * @returns {{wait:{place:number, text:string}|null, verifying:boolean, stalledSeconds:number|null}} stalledSeconds: set
 *   past `config.stallSeconds` without a CLI event
 */
export function stallInfo(id, waiting) {
  const session = state.sessions.get(id);
  const clock = clockOf(id);
  const wait = session?.modelWait || null;
  const verifying = Boolean(session?.verifying);
  if (waiting || wait || verifying || clock.held || session?.status !== 'running') clock.at = Date.now();
  const seconds = Math.floor((Date.now() - clock.at) / 1000);
  const stalled = seconds >= (Number(state.config.stallSeconds) || DEFAULT_SECONDS);
  if (stalled && !clock.stalled) window.dispatchEvent(new CustomEvent(STALL_EVENT, { detail: { sessionId: id } }));
  clock.stalled = stalled;
  return { wait, verifying, stalledSeconds: stalled ? seconds : null };
}
