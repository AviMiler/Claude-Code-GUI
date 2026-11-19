/**
 * Which local calendar days a `rule` schedule may run on: days.every (every n days from a date), days.weekdays,
 * days.monthDays (1–31 or 'last'; 31 skips shorter months), days.months, excludeDates and range {from, until}
 * (inclusive). All the parts that are given must hold together (AND).
 */
const { dayNumberOf, dateOfDay, daysInMonth } = require('./local-time');

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {string} text 'YYYY-MM-DD'
 * @returns {number|null} its day number, null when it is not a real date
 * @example parseDate('2026-02-30') // null
 */
function parseDate(text) {
  const match = typeof text === 'string' ? DATE.exec(text) : null;
  if (!match) return null;
  const [y, mo, d] = match.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return dayNumberOf(y, mo, d);
}

/**
 * @param {object} schedule a validated rule schedule
 * @returns {{allows:(day:number)=>boolean, first:number|null, last:number|null}} first / last: the range's bounds
 */
function compileDays(schedule) {
  const days = schedule.days || {};
  const every = days.every ? { n: days.every.n, from: parseDate(days.every.from) } : null;
  const weekdays = days.weekdays ? new Set(days.weekdays) : null;
  const monthDays = days.monthDays ? new Set(days.monthDays) : null;
  const months = days.months ? new Set(days.months) : null;
  const excluded = new Set((schedule.excludeDates || []).map(parseDate));
  const first = schedule.range?.from ? parseDate(schedule.range.from) : null;
  const last = schedule.range?.until ? parseDate(schedule.range.until) : null;

  function allows(day) {
    if ((first !== null && day < first) || (last !== null && day > last) || excluded.has(day)) return false;
    if (every && (day < every.from || (day - every.from) % every.n !== 0)) return false;
    const date = dateOfDay(day);
    if (weekdays && !weekdays.has(date.wd)) return false;
    if (months && !months.has(date.mo)) return false;
    if (monthDays && !monthDays.has(date.d) && !(monthDays.has('last') && date.d === daysInMonth(date.y, date.mo))) return false;
    return true;
  }
  return { allows, first, last };
}

module.exports = { compileDays, parseDate };
