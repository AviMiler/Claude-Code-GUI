/**
 * When a `rule` schedule (schedule-validate.js / rule-validate.js) runs. It walks local days (horizon ~5 years) and,
 * on an allowed day (rule-days.js), the pattern's nominal times of that day:
 *   interval: start + k * every (absolute elapsed time, k >= 0; the wall clock shifts across DST),
 *   times: the listed local wall times (a time in the spring-forward gap runs at the first valid minute after it; a
 *   repeated fall-back time runs once, at its first occurrence), once: the single instant `at`.
 * A nominal time outside the hour windows (rule-windows.js) is dropped ('skip') or becomes ONE deferred run at the end
 * of that excluded stretch ('delay', flagged delayed; an allowed nominal run at that very minute is not doubled; a
 * window end on a day the rule excludes drops the deferred run).
 * The local zone is injected (local-time.js) so tests can use a fake one.
 */
const { systemTime, dateOfDay, DAY, MINUTE } = require('./local-time');
const { compileDays } = require('./rule-days');
const { compileWindows, toMinute } = require('./rule-windows');

const HORIZON_DAYS = 5 * 366;
const MAX_STEPS = 20000;
const UNIT_MS = { minutes: MINUTE, hours: 60 * MINUTE };

/** @returns {number[]} the pattern's nominal instants on one local day, ascending */
function nominalTimes(pattern, day, local) {
  const { y, mo, d } = dateOfDay(day);
  if (pattern.type === 'times') {
    const times = pattern.times.map(text => { const minute = toMinute(text); return local.resolve(y, mo, d, Math.floor(minute / 60), minute % 60); });
    return [...new Set(times)].sort((a, b) => a - b);
  }
  const [begin, end] = [local.dayStart(day), local.dayStart(day + 1)];
  const period = pattern.every * UNIT_MS[pattern.unit];
  const result = [];
  for (let k = Math.max(0, Math.ceil((begin - pattern.start) / period)); pattern.start + k * period < end; k++) result.push(pattern.start + k * period);
  return result;
}

/**
 * Every run strictly after `after`, in order.
 * @param {object} schedule a validated rule schedule
 * @param {number} after ms
 * @param {object} [local] local-time.js helper
 * @yields {{at:number, delayed:boolean}}
 */
function* ruleRuns(schedule, after, local = systemTime) {
  const { pattern } = schedule;
  if (pattern.type === 'once') { if (pattern.at > after) yield { at: pattern.at, delayed: false }; return; }
  const days = compileDays(schedule);
  const windows = compileWindows(schedule.windows);
  const startDay = local.parts(after).day - (windows?.delay ? 2 : 0); // a deferred run may come from a nominal time before `after`
  let day = Math.max(startDay, days.first ?? startDay, pattern.type === 'interval' ? local.parts(pattern.start).day : startDay);
  const lastDay = Math.min(local.parts(after).day + HORIZON_DAYS, days.last ?? Infinity);
  let pending = null; // a deferred run not yet given out
  let last = -Infinity;
  const emit = function* (at, delayed) { if (at > last) { last = at; if (at > after) yield { at, delayed }; } };

  for (; day <= lastDay; day++) {
    if (!days.allows(day)) continue;
    for (const time of nominalTimes(pattern, day, local)) {
      const minute = local.parts(time).minute;
      if (pending !== null && time >= pending) { // the deferred run comes before this one, or is this one
        if (time > pending) yield* emit(pending, true);
        pending = null;
      }
      if (!windows || windows.allowed(minute)) { yield* emit(time, false); continue; }
      if (!windows.delay || pending !== null) continue;
      const next = windows.nextAllowed(minute);
      if (!next) return;
      const endDay = local.parts(time).day + next.dayOffset;
      const { y, mo, d } = dateOfDay(endDay);
      const end = local.resolve(y, mo, d, Math.floor(next.minute / 60), next.minute % 60);
      if (end > time && days.allows(endDay)) pending = end; // a deferred run never lands on a day the rule excludes
    }
  }
  if (pending !== null) yield* emit(pending, true);
}

/** @returns {{at:number, delayed:boolean}|null} the first run strictly after `after` */
function nextRule(schedule, after, local) {
  const { value } = ruleRuns(schedule, after, local).next();
  return value || null;
}

/** @returns {{at:number, delayed:boolean}[]} the next `count` runs */
function upcomingRule(schedule, after, count, local) {
  const runs = [];
  for (const run of ruleRuns(schedule, after, local)) { runs.push(run); if (runs.length >= count) break; }
  return runs;
}

/**
 * The latest run in (from, to] and how many the window held (more than one: some were missed). An excluded nominal
 * time is not a missed run; in delay mode its due time is the window end.
 * @returns {{at:number, count:number, delayed:boolean}|null}
 */
function latestRule(schedule, from, to, local) {
  let found = null;
  let steps = 0;
  for (const run of ruleRuns(schedule, from, local)) {
    if (run.at > to || ++steps > MAX_STEPS) break;
    found = { at: run.at, count: steps, delayed: run.delayed };
  }
  return found;
}

/** @returns {number} the most runs on one local day in the coming week (the form warns above ~48) */
function busiestDay(schedule, after, local = systemTime) {
  const perDay = new Map();
  for (const run of ruleRuns(schedule, after, local)) {
    if (run.at > after + 7 * DAY || perDay.size > 8) break;
    const day = local.parts(run.at).day;
    perDay.set(day, (perDay.get(day) || 0) + 1);
  }
  return Math.max(0, ...perDay.values());
}

module.exports = { ruleRuns, nextRule, upcomingRule, latestRule, busiestDay };
