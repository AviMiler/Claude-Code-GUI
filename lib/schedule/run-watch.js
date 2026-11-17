/**
 * Watches the runs a scheduler launched until their turn ends, with ONE timer that ticks only while a run is active.
 * A run that waits for a person (a permission prompt, a question, an MCP elicitation) is marked 'waiting' and, after
 * `approvalMs`, is stopped through the session's normal stop path and recorded as 'no-approval'. A run that hears
 * nothing from the CLI for `stallMs` (outside the model gate's line and outside a prompt) is marked `stalled`, and
 * after `stallStopMs` (0 = never) it is stopped and recorded as 'stalled', so the model is free for the next runs.
 * A session a person took over (sent a message, answered a prompt) is never stopped by the watcher.
 */
const STOP_GRACE_MS = 60000;
const STOP_REASONS = { approval: ['no-approval', 'נעצר: לא התקבל אישור בזמן'], stall: ['stalled', 'נעצרה: תקועה'] };

/**
 * @param {{store:object, now:()=>number, timers:{set:Function, clear:Function}, everyMs?:number,
 *   inspect:(sessionId:string)=>({status:string, pending:number, gateWait:boolean, lastEventAt:number|null,
 *     outcome:'done'|'error'|null, errorText:string, userTurns:number}|null),
 *   stop:(sessionId:string)=>Promise<unknown>, settings:()=>({approvalMs:number, stallMs:number, stallStopMs:number})}} deps
 * @returns {{add:Function, reserve:Function, release:Function, forget:Function, isActive:Function, step:Function, activeCount:()=>number}}
 */
function createRunWatch({ store, now, timers, inspect, stop, settings, everyMs = 2000 }) {
  const active = new Map(); // task id -> { runId, sessionId, startedAt, launched, waitingSince, stopping, stopReason, stalled, takenOver }
  let timer = null;

  function arm() {
    if (timer || !active.size) return;
    timer = timers.set(() => {
      timer = null;
      try { step(); } catch (error) { console.error('[schedule] watching runs failed:', error.message); }
      arm();
    }, everyMs);
  }

  function finish(taskId, run, outcome, reason = '') {
    active.delete(taskId);
    const endedAt = now();
    store.updateRun(taskId, run.runId, { outcome, reason, endedAt, durationMs: endedAt - run.startedAt, stalled: run.stalled });
  }

  /** The outcome of an ended turn, in the run history's words. A turn that ended by itself before the stop keeps its own. */
  function ended(taskId, run, state) {
    if (run.stopping && state.outcome !== 'done') return finish(taskId, run, ...STOP_REASONS[run.stopReason]);
    if (state.outcome === null) return finish(taskId, run, 'stopped', 'נעצר ידנית');
    if (state.outcome === 'error') return finish(taskId, run, 'error', `${run.stalled ? 'נתקע ואז נכשל: ' : ''}${state.errorText || 'הריצה נכשלה'}`);
    return finish(taskId, run, 'done', run.stalled ? 'הסתיים אחרי השהיה ארוכה' : '');
  }

  function stopRun(run, reason, time) {
    if (run.stopping || run.takenOver) return;
    run.stopping = time;
    run.stopReason = reason;
    Promise.resolve(stop(run.sessionId)).catch(error => console.error('[schedule] cannot stop a run:', error.message));
  }

  function check(taskId, run) {
    if (!store.get(taskId)) return active.delete(taskId); // the task was deleted while it ran
    const state = inspect(run.sessionId);
    if (!state) return finish(taskId, run, 'error', 'הסשן של הריצה נמחק');
    if (state.status !== 'running') return ended(taskId, run, state);
    const time = now();
    const { approvalMs, stallMs, stallStopMs } = settings();
    if (run.stopping && time - run.stopping >= STOP_GRACE_MS) return finish(taskId, run, ...STOP_REASONS[run.stopReason]); // the stop never ended the turn
    if (state.userTurns > 1) run.takenOver = true; // a person wrote into the session
    if (state.pending > 0) {
      if (!run.waitingSince) { run.waitingSince = time; store.updateRun(taskId, run.runId, { outcome: 'waiting' }); }
      if (time - run.waitingSince >= approvalMs) stopRun(run, 'approval', time);
      return undefined;
    }
    if (run.waitingSince && !run.stopping) { // the prompt was answered: a person took over
      run.waitingSince = null;
      run.takenOver = true;
      store.updateRun(taskId, run.runId, { outcome: 'running' });
    }
    if (state.gateWait) return undefined;
    const quiet = time - (state.lastEventAt || run.startedAt);
    if (!run.stalled && quiet >= stallMs) { run.stalled = true; store.updateRun(taskId, run.runId, { stalled: true }); }
    if (stallStopMs > 0 && quiet >= stallStopMs) stopRun(run, 'stall', time);
    return undefined;
  }

  /** One look at every active run (the timer calls it; tests may too). */
  function step() {
    for (const [taskId, run] of [...active]) {
      try { if (run.launched) check(taskId, run); } catch (error) { console.error(`[schedule] cannot watch the run of ${taskId}:`, error.message); }
    }
  }

  /** A run whose session exists and whose message was sent. */
  function add(taskId, runId, sessionId, startedAt) {
    active.set(taskId, { runId, sessionId, startedAt, launched: true, waitingSince: null, stopping: 0, stopReason: null, stalled: false, takenOver: false });
    arm();
  }

  /** Holds the task's place while its session is being created (an overlap check sees it as running). */
  const reserve = (taskId, runId, startedAt) => active.set(taskId, { runId, startedAt, launched: false });
  const release = taskId => active.delete(taskId);
  /** @returns {string|null} the session of the run that is no longer followed (to stop it) */
  const forget = taskId => { const run = active.get(taskId); active.delete(taskId); return run?.launched ? run.sessionId : null; };

  return { add, reserve, release, forget, isActive: taskId => active.has(taskId), step, activeCount: () => active.size };
}

module.exports = { createRunWatch };
