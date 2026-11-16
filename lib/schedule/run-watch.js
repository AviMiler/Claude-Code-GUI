/**
 * Watches the runs a scheduler launched until their turn ends, with ONE timer that ticks only while a run is active.
 * A run that waits for a person (a permission prompt, a question, an MCP elicitation) is marked 'waiting' and, after
 * `approvalMs`, is stopped through the session's normal stop path and recorded as 'no-approval'. A run that hears
 * nothing from the CLI for `stallMs` (outside the model gate's line and outside a prompt) is marked `stalled`.
 */
const STOP_GRACE_MS = 60000;

/**
 * @param {{store:object, now:()=>number, timers:{set:Function, clear:Function}, everyMs?:number,
 *   inspect:(sessionId:string)=>({status:string, pending:number, gateWait:boolean, lastEventAt:number|null,
 *     outcome:'done'|'error'|null, errorText:string}|null),
 *   stop:(sessionId:string)=>Promise<unknown>, settings:()=>({approvalMs:number, stallMs:number})}} deps
 * @returns {{add:Function, forget:Function, isActive:Function, step:Function, activeCount:()=>number}}
 */
function createRunWatch({ store, now, timers, inspect, stop, settings, everyMs = 2000 }) {
  const active = new Map(); // task id -> { runId, sessionId, startedAt, launched, waitingSince, stopping, stalled }
  let timer = null;

  function arm() {
    if (timer || !active.size) return;
    timer = timers.set(() => { timer = null; step(); arm(); }, everyMs);
  }

  function finish(taskId, run, outcome, reason = '') {
    active.delete(taskId);
    const endedAt = now();
    store.updateRun(taskId, run.runId, { outcome, reason, endedAt, durationMs: endedAt - run.startedAt, stalled: run.stalled });
  }

  /** The outcome of an ended turn, in the run history's words. */
  function ended(taskId, run, state) {
    if (run.stopping) return finish(taskId, run, 'no-approval', 'נעצר: לא התקבל אישור בזמן');
    if (state.outcome === null) return finish(taskId, run, 'stopped', 'נעצר ידנית');
    if (state.outcome === 'error') return finish(taskId, run, 'error', `${run.stalled ? 'נתקע ואז נכשל: ' : ''}${state.errorText || 'הריצה נכשלה'}`);
    return finish(taskId, run, 'done', run.stalled ? 'הסתיים אחרי השהיה ארוכה' : '');
  }

  function check(taskId, run) {
    if (!store.get(taskId)) return active.delete(taskId); // the task was deleted while it ran
    const state = inspect(run.sessionId);
    if (!state) return finish(taskId, run, 'error', 'הסשן של הריצה נמחק');
    if (state.status !== 'running') return ended(taskId, run, state);
    const time = now();
    const { approvalMs, stallMs } = settings();
    if (run.stopping && time - run.stopping >= STOP_GRACE_MS) return finish(taskId, run, 'no-approval', 'נעצר: לא התקבל אישור בזמן'); // the stop never ended the turn
    if (state.pending > 0) {
      if (!run.waitingSince) { run.waitingSince = time; store.updateRun(taskId, run.runId, { outcome: 'waiting' }); }
      if (!run.stopping && time - run.waitingSince >= approvalMs) {
        run.stopping = time;
        Promise.resolve(stop(run.sessionId)).catch(error => console.error('[schedule] cannot stop a run waiting for approval:', error.message));
      }
      return undefined;
    }
    if (run.waitingSince && !run.stopping) { run.waitingSince = null; store.updateRun(taskId, run.runId, { outcome: 'running' }); }
    const quietSince = state.lastEventAt || run.startedAt;
    if (!run.stalled && !state.gateWait && time - quietSince >= stallMs) {
      run.stalled = true;
      store.updateRun(taskId, run.runId, { stalled: true });
    }
    return undefined;
  }

  /** One look at every active run (the timer calls it; tests may too). */
  function step() {
    for (const [taskId, run] of [...active]) if (run.launched) check(taskId, run);
  }

  /** A run whose session exists and whose message was sent. */
  function add(taskId, runId, sessionId, startedAt) {
    active.set(taskId, { runId, sessionId, startedAt, launched: true, waitingSince: null, stopping: false, stalled: false });
    arm();
  }

  /** Holds the task's place while its session is being created (an overlap check sees it as running). */
  const reserve = (taskId, runId, startedAt) => active.set(taskId, { runId, startedAt, launched: false });
  const release = taskId => active.delete(taskId);

  return { add, reserve, release, forget: release, isActive: taskId => active.has(taskId), step, activeCount: () => active.size };
}

module.exports = { createRunWatch };
