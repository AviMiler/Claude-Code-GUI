/**
 * The scheduler: ONE timer that wakes at the next due run (at most MAX_SLEEP_MS later, so a system sleep is noticed by
 * comparing the wall clock on the next wake), fires what is due and arms itself again. Runs only while the server runs.
 * Catch-up: a task that missed runs (server down, machine asleep) runs ONCE, for its latest missed run, and only when
 * that run was due within CATCH_UP_MS; it is recorded as a catch-up. No overlap: while the task's previous run is still
 * going, a due run is recorded as skipped. A run is a new session (launch, see schedule-service.js) that run-watch.js
 * follows to its end. Time, timers, the launch and the session look-ups are injected (tests use a fake clock).
 */
const { nextRun, latestBetween } = require('./schedule-time');
const { createRunWatch } = require('./run-watch');
const { finishedNote, exhausted } = require('./rule-state');

const CATCH_UP_MS = 7 * 24 * 3600000;
const LATE_MS = 2 * 60000; // fired later than this after its time: a catch-up
const MAX_SLEEP_MS = 60000;
const LIVE = ['starting', 'running', 'waiting'];

/**
 * @param {{store:object, now?:()=>number, timers?:{set:Function, clear:Function},
 *   launch:(task:object, run:object)=>Promise<string>, inspect:Function, stop:Function, settings:Function, watchEveryMs?:number}} deps
 *   launch creates the run's session and sends the task's prompt, resolving to the session id
 * @returns {{start, reschedule, runNow, forget, isRunning, nextRunOf, tick}}
 */
function createRunner({ store, now = Date.now, timers = { set: setTimeout, clear: clearTimeout }, launch, inspect, stop, settings, watchEveryMs }) {
  const watch = createRunWatch({ store, now, timers, inspect, stop, settings, everyMs: watchEveryMs });
  let timer = null;

  const scheduled = task => task.active && !task.done && task.schedule?.kind !== 'manual';
  /** @returns {number|null} ms of the task's next run (null too for a schedule that cannot be read or a finished one) */
  const nextRunOf = task => { try { return scheduled(task) && !exhausted(task) ? nextRun(task.schedule, now()) : null; } catch { return null; } };

  /** A stored task that cannot be scheduled (a bad schedule, a hand-edited file) is paused with the reason, never thrown. */
  function disable(task, error) {
    console.error(`[schedule] task ${task.id} paused: ${error.message}`);
    store.update(task.id, { active: false, error: `המשימה הושהתה: ${error.message}` });
  }

  /**
   * Starts one run, or records it as skipped while the previous one still goes.
   * @returns {object} the run entry
   */
  function fire(task, { occurrence = null, catchUp = false, manual = false, delayed = false } = {}) {
    const startedAt = now();
    if (watch.isActive(task.id)) { // skips in a row are one entry with a count, so they never push real runs out of the history
      const last = task.runs?.[0];
      if (last?.outcome === 'skipped') return store.updateRun(task.id, last.id, { count: (last.count || 1) + 1, lastAt: startedAt, reason: `דולג ${(last.count || 1) + 1} פעמים: הריצה הקודמת עדיין פועלת` });
      return store.addRun(task.id, { startedAt, endedAt: startedAt, durationMs: 0, outcome: 'skipped', count: 1, lastAt: startedAt, reason: 'דולג: הריצה הקודמת עדיין פועלת', sessionId: null, occurrence, catchUp, manual, delayed });
    }
    const run = store.addRun(task.id, { startedAt, outcome: 'starting', reason: '', sessionId: null, occurrence, catchUp, manual, delayed });
    if (!manual) store.update(task.id, { runsDone: (task.runsDone || 0) + 1 }); // started runs count toward maxRuns; skips and "run now" do not
    watch.reserve(task.id, run.id, startedAt);
    Promise.resolve().then(() => launch(task, run)).then(sessionId => {
      if (!store.get(task.id)) return watch.release(task.id); // deleted while its session was being created
      store.updateRun(task.id, run.id, { sessionId, outcome: 'running' });
      return watch.add(task.id, run.id, sessionId, startedAt);
    }).catch(error => {
      watch.release(task.id);
      const endedAt = now();
      store.updateRun(task.id, run.id, { outcome: 'error', reason: `לא ניתן להתחיל: ${error.message}`, endedAt, durationMs: endedAt - startedAt });
    });
    return run;
  }

  function arm() {
    if (timer) timers.clear(timer);
    timer = null;
    const times = store.list().map(nextRunOf).filter(time => time !== null);
    if (!times.length) return;
    const delay = Math.min(Math.max(Math.min(...times) - now(), 0), MAX_SLEEP_MS);
    timer = timers.set(tick, delay);
  }

  /** Fires every task with a run due in (its last handled time, now], once, then arms the timer again. */
  function tick(startup = false) {
    if (timer) timers.clear(timer); // reschedule() ticks while a timer is pending: never leave a second loop running
    timer = null;
    const time = now();
    for (const task of store.list()) {
      try {
        if (!scheduled(task)) continue;
        // The clock went back: a mark in the future would hold the task until the clock catches up.
        if (task.checkedAt > time || task.since > time) store.update(task.id, { checkedAt: Math.min(task.checkedAt ?? time, time), since: Math.min(task.since ?? time, time) });
        const from = Math.max(task.checkedAt || 0, task.since || 0, time - CATCH_UP_MS);
        const due = exhausted(task) ? null : latestBetween(task.schedule, from, time);
        if (due) {
          store.update(task.id, { checkedAt: time });
          const catchUp = startup || due.count > 1 || time - due.at > LATE_MS;
          if (!catchUp || task.schedule.catchUp !== 'none') fire(task, { occurrence: due.at, catchUp, delayed: Boolean(due.delayed) });
        }
        const note = finishedNote(task, time); // a rule task with no more runs ends normally, it is not an error
        if (note) store.update(task.id, { active: false, done: true, doneNote: note, doneAt: time });
      } catch (error) { disable(task, error); }
    }
    try { arm(); } catch (error) { console.error('[schedule] cannot arm the timer:', error.message); timer = timers.set(tick, MAX_SLEEP_MS); }
  }

  /** At server start: runs that were live when the server stopped can no longer be followed. Then catch up. */
  function start() {
    for (const task of store.list()) {
      for (const run of task.runs || []) {
        if (LIVE.includes(run.outcome)) store.updateRun(task.id, run.id, { outcome: 'error', reason: 'השרת נעצר באמצע הריצה' });
      }
      try { if (task.schedule?.kind !== 'manual') nextRun(task.schedule, now()); } catch (error) { if (task.active || !task.error) disable(task, error); }
    }
    tick(true); // anything due now was missed while the server was down
  }

  /** "Run now". @throws {Error} status 409 while the previous run still goes */
  function runNow(task) {
    if (watch.isActive(task.id)) throw Object.assign(new Error('הריצה הקודמת של המשימה עדיין פועלת'), { status: 409 });
    return fire(task, { manual: true });
  }

  return {
    start, tick, runNow, nextRunOf, step: watch.step,
    /** After a create / edit / pause: fires what is due now and marks finished rule tasks, then arms the timer. */
    reschedule: () => tick(),
    /** The task was deleted: its live run is stopped through the session's stop path and no longer followed (its session stays). */
    forget: taskId => {
      const sessionId = watch.forget(taskId);
      if (sessionId) Promise.resolve(stop(sessionId)).catch(error => console.error('[schedule] cannot stop the deleted task\'s run:', error.message));
      arm();
    },
    isRunning: taskId => watch.isActive(taskId),
  };
}

module.exports = { createRunner, CATCH_UP_MS, MAX_SLEEP_MS };
