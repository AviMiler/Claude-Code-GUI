/**
 * The normal end of a `rule` task ("הסתיים"): its maxRuns were started, its range ended, or its single run passed.
 * This is not an error: the runner marks the task done (inactive, with a note) instead of pausing it with an error.
 */
const { nextRun } = require('./schedule-time');

/**
 * @param {object} task a stored task
 * @param {number} now ms
 * @returns {string|null} why the task has no more runs, null while it has (or when it is not a rule task)
 * @example finishedNote({ schedule: { kind: 'rule', maxRuns: 3, ... }, runsDone: 3 }, Date.now()) // 'הסתיים: 3 הרצות'
 */
function finishedNote(task, now) {
  const schedule = task.schedule;
  if (schedule?.kind !== 'rule') return null;
  if (schedule.maxRuns && (task.runsDone || 0) >= schedule.maxRuns) return `הסתיים: ${schedule.maxRuns} הרצות`;
  if (nextRun(schedule, now) !== null) return null;
  if (schedule.pattern.type === 'once' && !task.runsDone) return 'הסתיים: הריצה החד-פעמית הוחמצה (השרת לא פעל בזמנה)';
  return 'הסתיים: אין עוד ריצות לפי התזמון';
}

/** @returns {boolean} the task's maxRuns were all started (no due run may fire any more) */
const exhausted = task => Boolean(task.schedule?.maxRuns) && (task.runsDone || 0) >= task.schedule.maxRuns;

module.exports = { finishedNote, exhausted };
