process.env.TZ = 'America/New_York'; // a zone with DST, before any Date is made
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCron, nextCron } = require('../lib/schedule/cron');
const { nextRun, nextRuns, latestBetween } = require('../lib/schedule/schedule-time');

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const show = time => { const d = new Date(time); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const next = (expr, from) => show(nextCron(parseCron(expr), from));

test('parses *, lists, ranges and steps', () => {
  const spec = parseCron('*/15 9-11,14 1,15 */3 1-5');
  assert.deepEqual(spec.minutes, [0, 15, 30, 45]);
  assert.deepEqual(spec.hours, [9, 10, 11, 14]);
  assert.deepEqual([...spec.days], [1, 15]);
  assert.deepEqual([...spec.months], [1, 4, 7, 10]);
  assert.deepEqual([...spec.weekdays], [1, 2, 3, 4, 5]);
  assert.deepEqual(parseCron('5/20 * * * *').minutes, [5, 25, 45]);
  assert.deepEqual(parseCron('0 0 * * 7').weekdays, new Set([0]));
  assert.deepEqual(parseCron('1-10/3 * * * *').minutes, [1, 4, 7, 10]);
});

test('rejects bad expressions strictly', () => {
  for (const bad of ['', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8',
    '5-1 * * * *', '*/0 * * * *', 'a * * * *', '1,,2 * * * *', '-1 * * * *', '1-2-3 * * * *', '* * * JAN *', '? * * * *', '1.5 * * * *', '*/61 * * * *']) {
    assert.throws(() => parseCron(bad), error => error.status === 400, bad);
  }
});

test('next run: plain cases, month ends and Feb 29', () => {
  assert.equal(next('0 9 * * *', at(2026, 11, 16, 8, 59)), '2026-11-16 9:00');
  assert.equal(next('0 9 * * *', at(2026, 11, 16, 9, 0)), '2026-11-17 9:00');
  assert.equal(next('30 23 31 * *', at(2026, 11, 1)), '2026-12-31 23:30'); // November has no 31st
  assert.equal(next('0 0 29 2 *', at(2026, 3, 1)), '2028-2-29 0:00');
  assert.equal(next('0 0 29 2 1', at(2096, 3, 1)), '2097-2-4 0:00'); // OR rule: Feb 29 or a Monday of February
  assert.equal(next('0 0 29 2 *', at(2096, 3, 1)), '2104-2-29 0:00'); // 2100 is not a leap year
  assert.equal(nextCron(parseCron('0 0 30 2 *'), at(2026, 1, 1)), null);
  assert.equal(next('0 12 L * *'.replace('L', '28-31'), at(2027, 2, 28, 13)), '2027-3-28 12:00');
});

test('day-of-month and day-of-week both restricted: either matches; one starred: only the other', () => {
  assert.equal(next('0 8 13 * 5', at(2026, 11, 16)), '2026-11-20 8:00'); // Friday 20th before the 13th
  assert.equal(next('0 8 17 * 5', at(2026, 11, 16)), '2026-11-17 8:00'); // the 17th before Friday
  assert.equal(next('0 8 * * 5', at(2026, 11, 16)), '2026-11-20 8:00');
  assert.equal(next('0 8 13 * *', at(2026, 11, 16)), '2026-12-13 8:00');
  assert.equal(next('0 8 */2 * 5', at(2026, 11, 16)), '2026-11-20 8:00'); // */2 day counts as unrestricted
});

test('DST spring forward: a missing time runs once at the first valid minute', () => {
  // 2026-03-08 02:00 -> 03:00 in New York
  assert.equal(next('30 2 * * *', at(2026, 3, 8, 1, 0)), '2026-3-8 3:00');
  const spec = parseCron('0,30 2,3 * * *');
  const first = nextCron(spec, at(2026, 3, 8, 1, 0));
  assert.equal(show(first), '2026-3-8 3:00');
  assert.equal(show(nextCron(spec, first)), '2026-3-8 3:30'); // 02:00, 02:30 and 03:00 are one run
  assert.equal(next('30 2 * * *', at(2026, 3, 8, 3, 0)), '2026-3-9 2:30');
});

test('DST fall back: a repeated hour runs once', () => {
  // 2026-11-01 02:00 EDT -> 01:00 EST in New York
  const spec = parseCron('30 1 * * *');
  const first = nextCron(spec, at(2026, 11, 1, 0, 0));
  assert.equal(show(first), '2026-11-1 1:30');
  assert.equal(show(nextCron(spec, first)), '2026-11-2 1:30');
  const hourly = parseCron('0 * * * *');
  const one = nextCron(hourly, at(2026, 11, 1, 0, 30));
  assert.equal(nextCron(hourly, one) - one, 2 * 3600000); // 01:00 EDT, then 02:00 EST: no second 01:00
  const inside = first + 3600000; // the second 01:30
  assert.equal(show(nextCron(spec, inside)), '2026-11-2 1:30');
});

test('schedule kinds: daily, weekdays (Sun-Thu), weekly, hours, manual', () => {
  const from = at(2026, 11, 20, 10); // a Friday
  assert.equal(show(nextRun({ kind: 'daily', time: '09:00' }, from)), '2026-11-21 9:00');
  assert.equal(show(nextRun({ kind: 'weekdays', time: '09:00' }, from)), '2026-11-22 9:00'); // Sunday
  assert.equal(show(nextRun({ kind: 'weekly', days: [3], time: '07:15' }, from)), '2026-11-25 7:15');
  assert.equal(nextRun({ kind: 'manual' }, from), null);
  const hours = { kind: 'hours', every: 6, anchor: from };
  assert.deepEqual(nextRuns(hours, from, 3).map(show), ['2026-11-20 16:00', '2026-11-20 22:00', '2026-11-21 4:00']);
  assert.deepEqual(nextRuns({ kind: 'cron', expression: '0 */8 * * *' }, from, 3).map(show), ['2026-11-20 16:00', '2026-11-21 0:00', '2026-11-21 8:00']);
});

test('latestBetween: the latest run of a window and how many it held', () => {
  const daily = { kind: 'daily', time: '09:00' };
  const found = latestBetween(daily, at(2026, 11, 10, 12), at(2026, 11, 13, 10));
  assert.equal(show(found.at), '2026-11-13 9:00');
  assert.equal(found.count, 3);
  assert.equal(latestBetween(daily, at(2026, 11, 13, 9), at(2026, 11, 13, 10)), null); // the window excludes its start
  const hours = { kind: 'hours', every: 2, anchor: at(2026, 11, 13, 0) };
  assert.equal(latestBetween(hours, at(2026, 11, 13, 0), at(2026, 11, 13, 1)), null); // not at the anchor itself
  assert.deepEqual(latestBetween(hours, at(2026, 11, 13, 0), at(2026, 11, 13, 7)), { at: at(2026, 11, 13, 6), count: 3 });
  assert.equal(latestBetween({ kind: 'cron', expression: '* * * * *' }, at(2026, 11, 6), at(2026, 11, 13)).count, 7 * 1440);
});
