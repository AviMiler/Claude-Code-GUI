const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalTime } = require('../lib/schedule/local-time');
const { ruleRuns, upcomingRule, latestRule } = require('../lib/schedule/rule-time');

const HOUR = 3600000;
/** A fake zone with Jerusalem-like rules: +02:00, and +03:00 from the Friday before the last Sunday of March at 02:00
 * until the last Sunday of October at 02:00 (2026: March 27 – October 25). The TZ variable is never used. */
const lastSunday = (y, mo) => { const end = new Date(Date.UTC(y, mo, 0)); return end.getUTCDate() - end.getUTCDay(); };
const zone = {
  offset(ms) {
    const y = new Date(ms).getUTCFullYear();
    const summer = Date.UTC(y, 2, lastSunday(y, 3) - 2, 0, 0); // Friday 02:00 +02:00
    const winter = Date.UTC(y, 9, lastSunday(y, 10), 2, 0) - 3 * HOUR; // Sunday 02:00 +03:00
    return ms >= summer && ms < winter ? 180 : 120;
  },
};
const local = createLocalTime(zone);
const at = (y, mo, d, h = 0, mi = 0) => local.resolve(y, mo, d, h, mi);
const wall = ms => { const p = local.parts(ms); return `${p.y}-${p.mo}-${p.d} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`; };
const rule = (pattern, extra = {}) => ({ kind: 'rule', v: 1, pattern, days: {}, catchUp: 'latest', ...extra });
const next = (schedule, after, count = 5) => upcomingRule(schedule, after, count, local);

test('the fake zone: a spring gap and a repeated autumn hour', () => {
  assert.equal(at(2026, 3, 27, 2, 30), Date.UTC(2026, 2, 27, 0, 0)); // 02:30 does not exist: 03:00, the first valid minute
  assert.equal(at(2026, 10, 25, 1, 30), Date.UTC(2026, 9, 24, 22, 30)); // 01:30 happens twice: its first occurrence
  assert.equal(wall(Date.UTC(2026, 9, 24, 23, 30)), '2026-10-25 01:30'); // the second 01:30
});

test('times across DST: the gap moves forward, the repeated hour runs once', () => {
  const spring = next(rule({ type: 'times', times: ['02:30', '09:00'] }), at(2026, 3, 26, 12), 3).map(run => wall(run.at));
  assert.deepEqual(spring, ['2026-3-27 03:00', '2026-3-27 09:00', '2026-3-28 02:30']);
  const autumn = next(rule({ type: 'times', times: ['01:30'] }), at(2026, 10, 24, 12), 2).map(run => run.at);
  assert.equal(autumn[0], Date.UTC(2026, 9, 24, 22, 30));
  assert.equal(wall(autumn[1]), '2026-10-26 01:30');
});

test('an interval is absolute elapsed time: the wall clock shifts across DST', () => {
  const schedule = rule({ type: 'interval', every: 1, unit: 'hours', start: at(2026, 3, 26, 22) });
  const runs = next(schedule, at(2026, 3, 26, 21), 5);
  assert.deepEqual(runs.map(run => wall(run.at)), ['2026-3-26 22:00', '2026-3-26 23:00', '2026-3-27 00:00', '2026-3-27 01:00', '2026-3-27 03:00']);
  runs.slice(1).forEach((run, index) => assert.equal(run.at - runs[index].at, HOUR));
  const past = rule({ type: 'interval', every: 90, unit: 'minutes', start: at(2026, 11, 19, 8) }); // start not after `after`: next aligned time
  assert.equal(wall(next(past, at(2026, 11, 19, 10), 1)[0].at), '2026-11-19 11:00');
});

test('windows crossing midnight: skip, delay, and no duplicate at the window end', () => {
  const hourly = { type: 'interval', every: 1, unit: 'hours', start: at(2026, 11, 1) };
  const quiet = mode => ({ mode: 'except', ranges: [{ from: '22:00', to: '06:00' }], onExcluded: mode });
  const skip = next(rule(hourly, { windows: quiet('skip') }), at(2026, 11, 19, 20, 30), 3);
  assert.deepEqual(skip.map(run => wall(run.at)), ['2026-11-19 21:00', '2026-11-20 06:00', '2026-11-20 07:00']);
  const delay = next(rule(hourly, { windows: quiet('delay') }), at(2026, 11, 19, 20, 30), 3);
  assert.deepEqual(delay.map(run => [wall(run.at), run.delayed]), [['2026-11-19 21:00', false], ['2026-11-20 06:00', false], ['2026-11-20 07:00', false]]);
  const late = next(rule({ type: 'times', times: ['23:00', '23:30', '12:00'] }, { windows: quiet('delay') }), at(2026, 11, 19, 13), 2);
  assert.deepEqual(late.map(run => [wall(run.at), run.delayed]), [['2026-11-20 06:00', true], ['2026-11-20 12:00', false]]); // two excluded times: ONE deferred run
  const only = next(rule(hourly, { windows: { mode: 'only', ranges: [{ from: '09:00', to: '11:00' }, { from: '23:00', to: '01:00' }], onExcluded: 'skip' } }), at(2026, 11, 19, 8), 5);
  assert.deepEqual(only.map(run => wall(run.at)), ['2026-11-19 09:00', '2026-11-19 10:00', '2026-11-19 23:00', '2026-11-20 00:00', '2026-11-20 09:00']);
});

test('a deferred run that would land on an excluded day is dropped', () => {
  const schedule = rule({ type: 'times', times: ['23:00'] }, { days: { weekdays: [4] }, windows: { mode: 'except', ranges: [{ from: '22:00', to: '06:00' }], onExcluded: 'delay' } });
  assert.deepEqual(next(schedule, at(2026, 11, 18), 1), []); // Thursday 23:00 -> Friday 06:00, and Friday is not a run day
});

test('month ends: day 31 skips short months, "last" takes the last day, Feb 29 waits for a leap year', () => {
  const nine = { type: 'times', times: ['09:00'] };
  assert.equal(wall(next(rule(nine, { days: { monthDays: [31] } }), at(2026, 11, 19), 1)[0].at), '2026-12-31 09:00');
  assert.deepEqual(next(rule(nine, { days: { monthDays: ['last'] } }), at(2026, 11, 19), 2).map(run => wall(run.at)), ['2026-11-30 09:00', '2026-12-31 09:00']);
  assert.equal(wall(next(rule(nine, { days: { monthDays: [29], months: [2] } }), at(2026, 11, 19), 1)[0].at), '2028-2-29 09:00');
});

test('days combine by AND; every n days counts from its date; exclusions and the range are jumped over', () => {
  const nine = { type: 'times', times: ['09:00'] };
  const and = next(rule(nine, { days: { weekdays: [5], monthDays: [13] } }), at(2026, 11, 19), 1); // Friday the 13th
  assert.equal(wall(and[0].at), '2027-8-13 09:00');
  const every = next(rule(nine, { days: { every: { n: 3, from: '2026-11-18' } } }), at(2026, 11, 19), 2);
  assert.deepEqual(every.map(run => wall(run.at)), ['2026-11-21 09:00', '2026-11-24 09:00']);
  const excluded = Array.from({ length: 300 }, (_, index) => new Date(Date.UTC(2026, 10, 20 + index)).toISOString().slice(0, 10));
  assert.equal(wall(next(rule(nine, { excludeDates: excluded }), at(2026, 11, 19, 10), 1)[0].at), '2027-9-16 09:00');
  const ranged = rule(nine, { range: { from: '2026-12-01', until: '2026-12-02' } });
  assert.deepEqual(next(ranged, at(2026, 11, 19), 5).map(run => wall(run.at)), ['2026-12-1 09:00', '2026-12-2 09:00']);
});

test('once, never-occurring rules, and the latest run of a window for catch-up', () => {
  const once = rule({ type: 'once', at: at(2026, 12, 1, 10) });
  assert.equal(next(once, at(2026, 11, 19)).length, 1);
  assert.equal(next(once, at(2026, 12, 1, 10)).length, 0);
  assert.equal([...ruleRuns(rule({ type: 'times', times: ['09:00'] }, { range: { until: '2026-01-01' } }), at(2026, 11, 19), local)].length, 0);
  const hourly = rule({ type: 'interval', every: 1, unit: 'hours', start: at(2026, 11, 1) }, { windows: { mode: 'except', ranges: [{ from: '22:00', to: '06:00' }], onExcluded: 'delay' } });
  const latest = latestRule(hourly, at(2026, 11, 19, 20, 30), at(2026, 11, 20, 5), local);
  assert.deepEqual(latest && [wall(latest.at), latest.count], ['2026-11-19 21:00', 1]); // the excluded night is not missed runs
  const deferred = latestRule(rule({ type: 'times', times: ['23:00'] }, { windows: hourly.windows }), at(2026, 11, 20, 5), at(2026, 11, 20, 6, 1), local);
  assert.deepEqual([wall(deferred.at), deferred.delayed], ['2026-11-20 06:00', true]); // its due time is the window end
});
