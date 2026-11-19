/**
 * Server-side checks of a `rule` schedule (kind 'rule', v 1; see rule-time.js). The schedule is rebuilt from known
 * fields only; errors are Hebrew with status 400. A spread ({count, from, to}) is expanded to times here and kept for
 * editing. The never-occurs check is schedule-validate.js's, shared with the other kinds.
 */
const { parseDate } = require('./rule-days');
const { toMinute } = require('./rule-windows');
const { daysInMonth } = require('./local-time');

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LIMITS = { times: 24, windows: 6, excludeDates: 366, maxRuns: 9999 };
const UNITS = { minutes: [5, 1440], hours: [1, 168] };

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const pad = value => String(value).padStart(2, '0');
const timeText = minute => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

function time(value, label = 'השעה') {
  if (typeof value !== 'string' || !TIME.test(value)) fail(`${label} צריכה להיות בצורה HH:MM (00:00–23:59)`);
  return value;
}

function date(value, label) {
  if (parseDate(value) === null) fail(`${label}: תאריך לא תקין (YYYY-MM-DD)`);
  return value;
}

/** @returns {number[]} sorted unique integers in [min, max], or a failure with `message` */
function intList(raw, min, max, message, extra = []) {
  if (!Array.isArray(raw) || !raw.length || raw.some(value => !isInt(value, min, max) && !extra.includes(value))) fail(message);
  return [...new Set(raw)].sort((a, b) => (a === 'last') - (b === 'last') || a - b);
}

function spreadTimes(spread) {
  if (!isInt(spread?.count, 2, LIMITS.times)) fail(`מספר הפעמים בפיזור צריך להיות בין 2 ל-${LIMITS.times}`);
  const [from, to] = [toMinute(time(spread.from, 'שעת ההתחלה')), toMinute(time(spread.to, 'שעת הסיום'))];
  if (from >= to) fail('בפיזור, שעת ההתחלה צריכה להיות לפני שעת הסיום');
  const times = [...new Set(Array.from({ length: spread.count }, (_, index) => timeText(Math.round(from + (index * (to - from)) / (spread.count - 1)))))];
  if (times.length < spread.count) fail('יותר מדי פעמים בטווח השעות הזה');
  return { spread: { count: spread.count, from: spread.from, to: spread.to }, times };
}

function pattern(raw, now) {
  switch (raw?.type) {
    case 'interval': {
      const bounds = Object.hasOwn(UNITS, raw.unit) ? UNITS[raw.unit] : null; // never "__proto__" or "toString"
      if (!bounds) fail('יחידת זמן לא מוכרת');
      if (!isInt(raw.every, ...bounds)) fail(raw.unit === 'minutes' ? 'המרווח בדקות צריך להיות שלם, 5 עד 1440' : 'המרווח בשעות צריך להיות שלם, 1 עד 168');
      const start = raw.start === undefined ? now : raw.start;
      if (!Number.isFinite(start)) fail('זמן ההתחלה לא תקין');
      return { type: 'interval', every: raw.every, unit: raw.unit, start: Math.ceil(start / 60000) * 60000 };
    }
    case 'times': {
      if (raw.spread) return { type: 'times', ...spreadTimes(raw.spread) };
      if (!Array.isArray(raw.times) || !raw.times.length) fail('הוסף לפחות שעה אחת');
      if (raw.times.length > LIMITS.times) fail(`עד ${LIMITS.times} שעות ביום`);
      const times = raw.times.map(value => time(value));
      if (new Set(times).size !== times.length) fail('אותה שעה מופיעה פעמיים');
      return { type: 'times', times: times.sort() };
    }
    case 'once':
      if (!Number.isFinite(raw.at) || Number.isNaN(new Date(raw.at).getTime())) fail('מועד הריצה החד-פעמית לא תקין');
      return { type: 'once', at: Math.ceil(raw.at / 60000) * 60000 };
    default: return fail('סוג חזרה לא מוכר');
  }
}

function days(raw) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object') fail('בחירת ימים לא תקינה');
  const result = {};
  if (raw.every) {
    if (!isInt(raw.every.n, 1, 365)) fail('"כל כמה ימים" צריך להיות שלם, 1 עד 365');
    result.every = { n: raw.every.n, from: date(raw.every.from, 'התאריך של "כל כמה ימים"') };
  }
  if (raw.weekdays) result.weekdays = intList(raw.weekdays, 0, 6, 'בחר לפחות יום אחד בשבוע');
  if (raw.monthDays) result.monthDays = intList(raw.monthDays, 1, 31, 'בחר לפחות יום אחד בחודש', ['last']);
  if (raw.months) result.months = intList(raw.months, 1, 12, 'בחר לפחות חודש אחד');
  if (result.monthDays && result.months && !result.monthDays.includes('last')) {
    const longest = Math.max(...result.months.map(month => daysInMonth(2028, month))); // 2028: a leap year
    if (Math.min(...result.monthDays) > longest) fail(`היום ${Math.min(...result.monthDays)} לא קיים בחודשים שנבחרו`);
  }
  return result;
}

function windows(raw) {
  if (raw?.ranges !== undefined && !Array.isArray(raw.ranges)) fail('חלונות השעות צריכים להיות רשימה');
  if (!raw?.ranges?.length) return undefined;
  if (!['only', 'except'].includes(raw.mode)) fail('סוג חלון שעות לא מוכר');
  if (raw.ranges.length > LIMITS.windows) fail(`עד ${LIMITS.windows} חלונות שעות`);
  const ranges = raw.ranges.map(range => {
    const [from, to] = [time(range?.from, 'תחילת החלון'), time(range?.to, 'סוף החלון')];
    if (from === to) fail('חלון שעות צריך שעת התחלה ושעת סיום שונות');
    return { from, to };
  });
  return { mode: raw.mode, ranges, onExcluded: raw.onExcluded === 'delay' ? 'delay' : 'skip' };
}

/**
 * @param {object} raw the schedule from the request (kind 'rule')
 * @param {number} now ms; the start of an interval without one
 * @returns {object} a clean rule schedule
 * @example validateRule({ kind: 'rule', pattern: { type: 'times', times: ['09:00'] } }, Date.now())
 */
function validateRule(raw, now) {
  const schedule = { kind: 'rule', v: 1, pattern: pattern(raw.pattern, now) };
  if (schedule.pattern.type !== 'once') {
    schedule.days = days(raw.days);
    const hours = windows(raw.windows);
    if (hours) schedule.windows = hours;
    const excluded = raw.excludeDates || [];
    if (!Array.isArray(excluded) || excluded.length > LIMITS.excludeDates) fail(`עד ${LIMITS.excludeDates} תאריכים מוחרגים`);
    if (excluded.length) schedule.excludeDates = [...new Set(excluded.map(value => date(value, 'תאריך מוחרג')))].sort();
    const range = {};
    if (raw.range?.from) range.from = date(raw.range.from, 'תאריך ההתחלה');
    if (raw.range?.until) range.until = date(raw.range.until, 'תאריך הסיום');
    if (range.from && range.until && range.from > range.until) fail('תאריך ההתחלה אחרי תאריך הסיום');
    if (range.from || range.until) schedule.range = range;
    if (raw.maxRuns !== undefined && raw.maxRuns !== null && raw.maxRuns !== '') {
      if (!isInt(raw.maxRuns, 1, LIMITS.maxRuns)) fail(`מספר ההרצות המרבי צריך להיות 1 עד ${LIMITS.maxRuns}`);
      schedule.maxRuns = raw.maxRuns;
    }
  }
  schedule.catchUp = raw.catchUp === 'none' ? 'none' : 'latest';
  return schedule;
}

module.exports = { validateRule, LIMITS };
