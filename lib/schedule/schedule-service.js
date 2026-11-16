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
    settings: () => ({ approvalMs: config.scheduleApprovalMinutes * 60000, stallMs: config.stallSeconds * 1000 }),
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
  return { ...rest, scheduleText: describeSchedule(task.schedule), nextRunAt: runner.nextRunOf(task), lastRun: runs[0] || null, running: runner.isRunning(task.id) };
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
    const recount = JSON.stringify(fields.schedule) !== JSON.stringify(previous.schedule) || (fields.active && !previous.active);
    const task = store.update(id, { ...fields, updatedAt: Date.now(), ...(recount && restartCount()) });
    runner.reschedule();
    return view(task);
  },
  setActive(id, active) {
    const previous = requireTask(id);
    if (typeof active !== 'boolean') throw httpError(400, 'ערך פעיל/מושהה לא תקין');
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
  /** The form's live check: the schedule in words and its next three runs, or a 400 with what is wrong. */
  preview(body) {
    const schedule = validateSchedule(body?.schedule, Date.now());
    return { text: describeSchedule(schedule), next: schedule.kind === 'manual' ? [] : nextRuns(schedule, Date.now(), 3) };
  },
};
