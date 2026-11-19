const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
process.env.CLAUDE_GUI_DATA = dataDir; // schedule-validate loads session-options, which loads session-store
process.on('exit', () => fs.rmSync(dataDir, { recursive: true, force: true }));
const { validateSchedule } = require('../lib/schedule/schedule-validate');
const { describeSchedule } = require('../lib/schedule/schedule-text');

const now = new Date(2026, 10, 19, 10, 0).getTime();
const times = (extra = {}) => ({ kind: 'rule', pattern: { type: 'times', times: ['09:00'] }, ...extra });
const rejects = (raw, pattern) => assert.throws(() => validateSchedule(raw, now), error => error.status === 400 && (!pattern || pattern.test(error.message)), JSON.stringify(raw));

test('a rule is rebuilt from known fields; a spread becomes times and is kept for editing', () => {
  const clean = validateSchedule({ ...times(), extra: 1, days: { weekdays: [4, 0, 4], evil: true }, windows: { mode: 'only', ranges: [{ from: '08:00', to: '18:00' }] }, maxRuns: 3 }, now);
  assert.deepEqual(clean, { kind: 'rule', v: 1, pattern: { type: 'times', times: ['09:00'] }, days: { weekdays: [0, 4] }, windows: { mode: 'only', ranges: [{ from: '08:00', to: '18:00' }], onExcluded: 'skip' }, maxRuns: 3, catchUp: 'latest' });
  const spread = validateSchedule({ kind: 'rule', pattern: { type: 'times', spread: { count: 4, from: '09:00', to: '18:00' } } }, now);
  assert.deepEqual(spread.pattern, { type: 'times', spread: { count: 4, from: '09:00', to: '18:00' }, times: ['09:00', '12:00', '15:00', '18:00'] });
  const interval = validateSchedule({ kind: 'rule', pattern: { type: 'interval', every: 90, unit: 'minutes', start: now + 30000 } }, now);
  assert.equal(interval.pattern.start, now + 60000); // rounded up to the minute
  assert.deepEqual(validateSchedule(times({ days: { monthDays: ['last', 15, 1] } }), now).days.monthDays, [1, 15, 'last']);
});

test('rejects bad rules with Hebrew messages', () => {
  rejects({ kind: 'rule', pattern: { type: 'interval', every: 4, unit: 'minutes', start: now } }, /5 עד 1440/);
  rejects({ kind: 'rule', pattern: { type: 'interval', every: 2, unit: 'days', start: now } });
  rejects(times({ pattern: { type: 'times', times: [] } }));
  rejects(times({ pattern: { type: 'times', times: ['09:00', '09:00'] } }), /פעמיים/);
  rejects(times({ pattern: { type: 'times', times: Array.from({ length: 25 }, (_, i) => `${String(i % 24).padStart(2, '0')}:0${i >= 24 ? 1 : 0}`) } }), /עד 24/);
  rejects(times({ pattern: { type: 'times', spread: { count: 1, from: '09:00', to: '10:00' } } }));
  rejects(times({ pattern: { type: 'times', spread: { count: 3, from: '10:00', to: '09:00' } } }), /לפני/);
  rejects(times({ windows: { mode: 'except', ranges: [{ from: '09:00', to: '09:00' }] } }), /שונות/);
  rejects(times({ windows: { mode: 'except', ranges: Array(7).fill({ from: '01:00', to: '02:00' }) } }), /עד 6/);
  rejects(times({ excludeDates: ['2026-02-30'] }), /תאריך/);
  rejects(times({ excludeDates: Array(367).fill('2027-01-01') }));
  rejects(times({ maxRuns: 0 })); rejects(times({ maxRuns: 10000 })); rejects(times({ maxRuns: 1.5 }));
  rejects(times({ range: { from: '2027-02-01', until: '2027-01-01' } }), /אחרי/);
  rejects(times({ days: { monthDays: [31], months: [2] } }), /31 לא קיים/);
  rejects(times({ days: { weekdays: [] } }));
});

test('a rule that never occurs is an error', () => {
  rejects(times({ range: { until: '2026-01-01' } }), /לעולם לא מתקיים/);
  rejects({ kind: 'rule', pattern: { type: 'once', at: now - 60000 } }, /לעולם לא מתקיים/);
  rejects(times({ windows: { mode: 'except', ranges: [{ from: '00:00', to: '12:00' }, { from: '12:00', to: '00:00' }] } }), /לעולם לא מתקיים/);
  rejects(times({ days: { weekdays: [5], monthDays: [31], months: [4, 6, 9, 11] } }), /לא קיים|לעולם/);
});

test('the summary says what the rule does, and that day conditions combine by AND', () => {
  const schedule = validateSchedule({
    kind: 'rule', pattern: { type: 'interval', every: 90, unit: 'minutes', start: new Date(2026, 10, 19, 8, 0).getTime() },
    windows: { mode: 'only', ranges: [{ from: '09:00', to: '18:00' }] }, days: { weekdays: [0, 1, 2, 3, 4] }, excludeDates: ['2026-12-25'], maxRuns: 12,
  }, now);
  assert.equal(describeSchedule(schedule).replace(/ \(מרווח קבוע[^)]*\)/, ''), 'כל 90 דקות החל מ-08:00, רק בין 09:00 ל-18:00, בימי ראשון עד חמישי, ללא התאריכים 25.12.2026, עד 12 הרצות');
  assert.match(describeSchedule(schedule), /שעון קיץ/);
  assert.match(describeSchedule(validateSchedule(times({ days: { weekdays: [5], monthDays: [13] } }), now)), /כל תנאי הימים מתקיימים יחד/);
  assert.equal(describeSchedule(validateSchedule(times({ pattern: { type: 'times', times: ['13:30', '09:00'] } }), now)), 'כל יום ב-09:00, 13:30');
});

test('old kinds keep their exact shapes (no rewrite to rule)', () => {
  assert.deepEqual(validateSchedule({ kind: 'daily', time: '09:00' }, now), { kind: 'daily', time: '09:00' });
  assert.deepEqual(validateSchedule({ kind: 'hours', every: 2 }, now), { kind: 'hours', every: 2, anchor: now });
});
