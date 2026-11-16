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

  const scheduled = task => task.active && task.schedule.kind !== 'manual';
  /** @returns {number|null} ms of the task's next run */
  const nextRunOf = task => (scheduled(task) ? nextRun(task.schedule, Math.max(now(), task.checkedAt || 0)) : null);

  /**
   * Starts one run, or records it as skipped while the previous one still goes.
   * @returns {object} the run entry
   */
  function fire(task, { occurrence = null, catchUp = false, manual = false } = {}) {
    const startedAt = now();
    if (watch.isActive(task.id)) {
      return store.addRun(task.id, { startedAt, endedAt: startedAt, durationMs: 0, outcome: 'skipped', reason: 'דולג: הריצה הקודמת עדיין פועלת', sessionId: null, occurrence, catchUp, manual });
    }
    const run = store.addRun(task.id, { startedAt, outcome: 'starting', reason: '', sessionId: null, occurrence, catchUp, manual });
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
  function tick() {
    timer = null;
    const time = now();
    for (const task of store.list()) {
      if (!scheduled(task)) continue;
      const from = Math.max(task.checkedAt || 0, task.since || 0, time - CATCH_UP_MS);
      const due = latestBetween(task.schedule, from, time);
      if (!due) continue;
      store.update(task.id, { checkedAt: time });
      fire(task, { occurrence: due.at, catchUp: due.count > 1 || time - due.at > LATE_MS });
    }
    arm();
  }

  /** At server start: runs that were live when the server stopped can no longer be followed. Then catch up. */
  function start() {
    for (const task of store.list()) {
      for (const run of task.runs || []) {
        if (LIVE.includes(run.outcome)) store.updateRun(task.id, run.id, { outcome: 'error', reason: 'השרת נעצר באמצע הריצה' });
      }
    }
    tick();
  }

  /** "Run now". @throws {Error} status 409 while the previous run still goes */
  function runNow(task) {
    if (watch.isActive(task.id)) throw Object.assign(new Error('הריצה הקודמת של המשימה עדיין פועלת'), { status: 409 });
    return fire(task, { manual: true });
  }

  return {
    start, tick, runNow, nextRunOf, reschedule: arm, step: watch.step,
    /** The task was deleted: its live run is no longer followed (its session stays). */
    forget: taskId => { watch.forget(taskId); arm(); },
    isRunning: taskId => watch.isActive(taskId),
  };
}

module.exports = { createRunner, CATCH_UP_MS, MAX_SLEEP_MS };
