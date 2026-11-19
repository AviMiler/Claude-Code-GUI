/**
 * Local scheduled tasks: the store (data/schedules.json), the runner, and what the routes call. A run is an ordinary
 * new session made by createSession + sendMessage (so the model gate serialises it with the user's own turns), named
 * after the task and the time, with `scheduled: { taskId, runId }` in its meta (the sidebar's clock badge).
 * Started by server.js; runs only while the server runs.
 */
const path = require('path');
const sessions = require('../session-service');
const sessionStore = require('../session-store');
const runtime = require('../session-runtime');
const modelGate = require('../model-gate/gate-state');
const lastEvent = require('../stall/last-event');
const { turnOutcome } = require('../sync/turn-outcome');
const { requireFolder, VALID_MODES } = require('../session-common');
const { getCapabilities } = require('../cli-capabilities');
const { httpError } = require('../http-utils');
const { createScheduleStore } = require('./schedule-store');
const { createRunner } = require('./runner');
const { validateTask, validateSchedule } = require('./schedule-validate');
const { nextRuns } = require('./schedule-time');
const { upcomingRule, busiestDay } = require('./rule-time');
const { describeSchedule, dateLabel } = require('./schedule-text');

let config = null;
let store = null;
let runner = null;

/** The run's session: its state as the run watcher needs it (run-watch.js). */
function inspect(sessionId) {
  const session = sessionStore.get(sessionId);
  if (!session) return null;
  const items = session.items || [];
  const turnStart = Math.max(0, items.findLastIndex(item => item.kind === 'user' && !item.correction));
  const errorItem = items.slice(turnStart).findLast(item => item.kind === 'error');
  return {
    status: session.status, pending: runtime.pendingFor(sessionId).length, gateWait: Boolean(modelGate.waitOf(sessionId)),
    lastEventAt: lastEvent.at(sessionId), outcome: turnOutcome(items), errorText: errorItem?.text || '',
    userTurns: items.filter(item => item.kind === 'user').length + (session.queue?.length || 0), // more than the run's own: a person took over
  };
}

async function launch(task, run) {
  const session = sessions.createSession({
    name: `${task.name} · ${dateLabel(run.startedAt)}`, named: true, cwd: task.folder, mode: task.mode, model: task.model, effort: task.effort,
    options: { scheduled: { taskId: task.id, runId: run.id } },
  }, config);
  await sessions.sendMessage(session.id, task.prompt, config);
  return session.id;
}

/** @param {object} serverConfig the loaded config.json; call once at startup */
function start(serverConfig) {
  if (runner) return;
  config = serverConfig;
  store = createScheduleStore({ file: path.join(sessionStore.DATA_DIR, 'schedules.json') });
  runner = createRunner({
    store, launch, inspect, stop: id => sessions.stopSession(id),
    settings: () => ({ approvalMs: config.scheduleApprovalMinutes * 60000, stallMs: config.stallSeconds * 1000, stallStopMs: config.scheduleStallMinutes * 60000 }),
  });
  runner.start();
}

function requireTask(id) {
  const task = store.get(id);
  if (!task) throw httpError(404, 'המשימה לא נמצאה');
  return task;
}

/** A task as the browser lists it: no run history (that is `runs`), plus its next run and last run. */
const view = task => {
  const { runs, ...rest } = task;
  let scheduleText = '';
  try { scheduleText = describeSchedule(task.schedule || {}); } catch { /* an unreadable stored schedule: `error` says why */ }
  return { ...rest, runs: undefined, scheduleText, nextRunAt: runner.nextRunOf(task), lastRun: runs[0] || null, running: runner.isRunning(task.id) };
};

async function rules(previous) {
  const cliModes = (await getCapabilities(config)).permissionModes.map(mode => (mode === 'manual' ? 'default' : mode));
  return { modes: cliModes.filter(mode => VALID_MODES.includes(mode)), checkFolder: requireFolder, now: Date.now(), previous };
}

/** Changing the schedule or resuming starts the count again: no catch-up for the time before. */
const restartCount = () => ({ since: Date.now(), checkedAt: null });

module.exports = {
  start,
  list: () => ({ tasks: store.list().map(view), approvalMinutes: config.scheduleApprovalMinutes }),
  async create(body) {
    const task = store.create(validateTask(body, await rules()));
    runner.reschedule();
    return view(task);
  },
  async update(id, body) {
    const previous = requireTask(id);
    const fields = validateTask(body, await rules(previous));
    const newSchedule = JSON.stringify(fields.schedule) !== JSON.stringify(previous.schedule);
    const recount = newSchedule || (fields.active && !previous.active);
    // A finished task is active again after an edit; it ends again at once unless the new schedule has more runs.
    const task = store.update(id, { ...fields, error: null, done: false, doneNote: null, updatedAt: Date.now(), ...(recount && restartCount()), ...(newSchedule && { runsDone: 0 }) });
    runner.reschedule();
    return view(task);
  },
  setActive(id, active) {
    const previous = requireTask(id);
    if (typeof active !== 'boolean') throw httpError(400, 'ערך פעיל/מושהה לא תקין');
    if (active && previous.error) throw httpError(400, `${previous.error}. ערוך את המשימה ושמור כדי לתקן.`);
    if (active && previous.done) throw httpError(400, 'המשימה הסתיימה. ערוך את התזמון ושמור כדי להפעיל אותה שוב.');
    const task = store.update(id, { active, updatedAt: Date.now(), ...(active && !previous.active && restartCount()) });
    runner.reschedule();
    return view(task);
  },
  remove(id) {
    requireTask(id);
    store.remove(id);
    runner.forget(id); // after the removal, so the timer is armed without it
    return { ok: true };
  },
  runNow: id => runner.runNow(requireTask(id)),
  runs: id => ({ runs: requireTask(id).runs }),
  /**
   * The form's live check: the schedule in words, its next five runs (`delayed[i]`: deferred to a window end) and the
   * most runs on one day of the coming week (`perDay`, the form warns above ~48), or a 400 with what is wrong.
   */
  preview(body) {
    const now = Date.now();
    const schedule = validateSchedule(body?.schedule, now);
    if (schedule.kind === 'manual') return { text: describeSchedule(schedule), next: [], delayed: [], perDay: 0 };
    if (schedule.kind !== 'rule') return { text: describeSchedule(schedule), next: nextRuns(schedule, now, 5), delayed: [], perDay: 0 };
    const runs = upcomingRule(schedule, now, 5);
    return { text: describeSchedule(schedule), next: runs.map(run => run.at), delayed: runs.map(run => run.delayed), perDay: busiestDay(schedule, now) };
  },
};
