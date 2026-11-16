/**
 * When a task's schedule runs, in local time. Shapes (validated by schedule-validate.js):
 *   { kind: 'manual' } | { kind: 'hours', every: 1..24, anchor: ms } | { kind: 'daily', time: 'HH:MM' }
 *   | { kind: 'weekdays', time } (Sunday–Thursday, the Israeli work week) | { kind: 'weekly', days: [0..6], time }
 *   | { kind: 'cron', expression }
 * 'hours' runs every `every` hours after its anchor (the minute the schedule was saved; not at the anchor itself);
 * the others are cron expressions.
 */
const { parseCron, nextCron } = require('./cron');

const WEEKDAYS = [0, 1, 2, 3, 4];
const MAX_STEPS = 20000; // a 7-day window of an every-minute cron is 10080

/** @returns {string|null} the cron expression of a daily / weekdays / weekly / cron schedule */
function cronOf(schedule) {
  const [hour, minute] = String(schedule.time || '').split(':').map(Number);
  if (schedule.kind === 'daily') return `${minute} ${hour} * * *`;
  if (schedule.kind === 'weekdays') return `${minute} ${hour} * * ${WEEKDAYS.join(',')}`;
  if (schedule.kind === 'weekly') return `${minute} ${hour} * * ${[...schedule.days].sort().join(',')}`;
  if (schedule.kind === 'cron') return schedule.expression;
  return null;
}

/**
 * @param {object} schedule
 * @param {number} after ms
 * @returns {number|null} the first run strictly after `after`; null for manual-only (or a cron that never matches)
 * @example nextRun({ kind: 'daily', time: '09:00' }, Date.now())
 */
function nextRun(schedule, after) {
  if (schedule.kind === 'hours') {
    const period = schedule.every * 3600000;
    return schedule.anchor + Math.max(1, Math.floor((after - schedule.anchor) / period) + 1) * period;
  }
  const expression = cronOf(schedule);
  return expression ? nextCron(parseCron(expression), after) : null;
}

/**
 * @returns {number[]} the next `count` runs after `after`
 * @example nextRuns({ kind: 'cron', expression: '0 * * * *' }, Date.now(), 3)
 */
function nextRuns(schedule, after, count = 3) {
  const runs = [];
  let time = after;
  while (runs.length < count) {
    time = nextRun(schedule, time);
    if (time === null) break;
    runs.push(time);
  }
  return runs;
}

/**
 * The latest run in (from, to], and how many runs that window held (more than one: some were missed).
 * @returns {{at:number, count:number}|null}
 */
function latestBetween(schedule, from, to) {
  if (schedule.kind === 'hours') {
    const period = schedule.every * 3600000;
    const last = Math.floor((to - schedule.anchor) / period); // runs are anchor + k * period, k >= 1
    const first = Math.max(1, Math.floor((from - schedule.anchor) / period) + 1);
    if (last < 1 || last < first) return null;
    return { at: schedule.anchor + last * period, count: last - first + 1 };
  }
  const expression = cronOf(schedule);
  if (!expression) return null;
  const spec = parseCron(expression);
  let found = null;
  let count = 0;
  for (let time = nextCron(spec, from), steps = 0; time !== null && time <= to && steps < MAX_STEPS; time = nextCron(spec, time), steps++) {
    found = time;
    count++;
  }
  return found === null ? null : { at: found, count };
}

module.exports = { cronOf, nextRun, nextRuns, latestBetween, WEEKDAYS };
