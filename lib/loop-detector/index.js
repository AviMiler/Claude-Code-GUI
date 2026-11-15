/**
 * Loop detector glue (one detector per session turn): watches the items of the running turn (session-events.js onItem);
 * on a verdict it posts a notice, stops the turn through the normal stop path and parks the queue the stop took off.
 * The queued messages STAY QUEUED (not sent by themselves: the next automatic send is skipped once, see holdOnce);
 * the stop is not shown as "the user stopped" (the notice has `loopStopped`, not `stopped`; the browser notifies it as an error).
 */
const store = require('../session-store');
const { loadConfig } = require('../config');
const { publish, pushExtra } = require('../session-common');
const { createLoopDetector } = require('./detector');

const detectors = new Map(); // session id -> detector of the running turn
const stopped = new Set(); // sessions whose stop came from the detector (the "stopped" notice is replaced)
const held = new Set(); // sessions whose parked queue must not be sent by the turn end that follows the stop

function noticeText({ reason, count, call }) {
  const what = reason === 'edit-fail' ? `נכשל ${count} פעמים ברצף בעריכת אותו קובץ` : `חזר על אותה קריאה ${count} פעמים ברצף`;
  return `Claude ${what} (${call}). הריצה נעצרה כדי לא לבזבז זמן. אפשר לכתוב לו מה לעשות אחרת.`;
}

/** Called for every item of a session; stops the turn when it is a loop. */
function watch(id, item) {
  if (!detectors.has(id)) detectors.set(id, createLoopDetector(loadConfig().loopRepeat)); // config read once per turn
  const verdict = detectors.get(id).observe(item);
  if (!verdict || !store.get(id)) return;
  const queue = store.get(id).queue || [];
  stopped.add(id);
  pushExtra(id, { kind: 'notice', text: noticeText(verdict), level: 'warning', loopStopped: true });
  require('../session-messages').stopSession(id).then(result => { // lazy: session-messages needs this module too
    if (!result.stopped) return void stopped.delete(id);
    const session = store.get(id);
    if (!session || !queue.length) return;
    publish(store.update(id, { queue: [...queue, ...(session.queue || [])] }));
    if (session.status === 'running') held.add(id);
  }).catch(error => { stopped.delete(id); console.error('[loop-detector] stop failed:', error.message); });
}

/** A turn ended or resumed: forget its streak. With `all` (process exit) the parked-queue mark goes too. */
function reset(id, all) {
  detectors.delete(id);
  stopped.delete(id); // the stop's result was reported before the turn ended
  if (all) held.delete(id);
}

/** True once when the stop being reported came from the detector (the caller then skips "הריצה הופסקה."). */
const take = id => stopped.delete(id);

/** True once right after a loop stop: dispatchNext skips that automatic send so the parked queue waits. */
const holdOnce = id => held.delete(id);

module.exports = { watch, reset, take, holdOnce };
