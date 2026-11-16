/**
 * Scheduled tasks and their run history in ONE JSON file of the GUI's data folder (`schedules.json`), written
 * atomically through lib/safe-file.js after every change. Never in a project, never in ~/.claude.
 * Shape: { version: 1, tasks: [{ id, name, prompt, folder, mode, model, effort, active, schedule, createdAt, updatedAt,
 *   since, checkedAt, runs: [run, ...newest first, at most MAX_RUNS] }] }
 * since: runs before it are never caught up (creation, resume, a new schedule); checkedAt: runs up to it were handled.
 * run: { id, startedAt, endedAt, durationMs, outcome, reason, sessionId, catchUp, manual, occurrence, stalled }
 */
const crypto = require('crypto');
const realFs = require('fs');
const path = require('path');
const { writeFileSafe, readFileSafe } = require('../safe-file');

const MAX_RUNS = 50;

/**
 * @param {{file:string, fs?:object, now?:()=>number}} options
 * @returns {{list, get, create, update, remove, addRun, updateRun}}
 */
function createScheduleStore({ file, fs = realFs, now = Date.now }) {
  const parse = textValue => {
    const saved = JSON.parse(textValue);
    if (!saved || !Array.isArray(saved.tasks)) throw new Error('not a task file');
    return saved;
  };
  const tasks = new Map((readFileSafe(file, parse, { fs }).value?.tasks || []).map(task => [task.id, { runs: [], ...task }]));

  function save() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      writeFileSafe(file, JSON.stringify({ version: 1, tasks: [...tasks.values()] }, null, 1), { fs });
    } catch (error) {
      console.error('[schedule-store] cannot save scheduled tasks:', error.message);
    }
  }

  const get = id => tasks.get(id) || null;

  /** @param {object} fields validated task fields (schedule-validate.js) */
  function create(fields) {
    const time = now();
    const task = { id: crypto.randomUUID(), ...fields, createdAt: time, updatedAt: time, since: time, checkedAt: null, runs: [] };
    tasks.set(task.id, task);
    save();
    return task;
  }

  function update(id, patch) {
    const task = tasks.get(id);
    if (!task) return null;
    Object.assign(task, patch);
    save();
    return task;
  }

  function remove(id) {
    const existed = tasks.delete(id);
    if (existed) save();
    return existed;
  }

  /** Newest first; the oldest beyond MAX_RUNS are dropped. */
  function addRun(id, run) {
    const task = tasks.get(id);
    if (!task) return null;
    const entry = { id: crypto.randomUUID(), ...run };
    task.runs = [entry, ...(task.runs || [])].slice(0, MAX_RUNS);
    save();
    return entry;
  }

  function updateRun(id, runId, patch) {
    const run = tasks.get(id)?.runs.find(entry => entry.id === runId);
    if (!run) return null;
    Object.assign(run, patch);
    save();
    return run;
  }

  return { list: () => [...tasks.values()], get, create, update, remove, addRun, updateRun };
}

module.exports = { createScheduleStore, MAX_RUNS };
