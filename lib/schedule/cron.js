/**
 * A strict 5-field cron parser and next-run search in LOCAL time (minute hour day-of-month month day-of-week).
 * Fields take `*`, numbers, lists (`1,5`), ranges (`1-5`) and steps (`*\/15`, `1-30/5`, `5/10`); day-of-week 0 and 7
 * are Sunday. No names, no `?` / `L` / `W` / `#`. Day-of-month and day-of-week both restricted: a day matches either
 * (the standard OR rule); a field starting with `*` counts as unrestricted.
 * DST: a local time that does not exist (spring forward) runs once at the first minute after the gap; a repeated
 * local time (fall back) runs once, at its first occurrence. Pure: no timers, only the process's local time zone.
 */
const FIELDS = [
  { label: 'דקה', min: 0, max: 59 },
  { label: 'שעה', min: 0, max: 23 },
  { label: 'יום בחודש', min: 1, max: 31 },
  { label: 'חודש', min: 1, max: 12 },
  { label: 'יום בשבוע', min: 0, max: 7 },
];
const MINUTE = 60000;
const SEARCH_DAYS = 366 * 9; // Feb 29 on a given weekday may be years away (2100 is no leap year)

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

function number(text, field) {
  if (!/^\d{1,2}$/.test(text)) fail(`${field.label}: "${text}" אינו מספר`);
  const value = Number(text);
  if (value < field.min || value > field.max) fail(`${field.label}: ${value} מחוץ לטווח ${field.min}–${field.max}`);
  return value;
}

/** @returns {number[]} the sorted values one field allows */
function parseField(text, field) {
  const values = new Set();
  for (const part of text.split(',')) {
    const match = /^([^/]+)(?:\/(.+))?$/.exec(part);
    if (!match) fail(`${field.label}: "${part}" לא תקין`);
    const [, base, stepText] = match;
    const step = stepText === undefined ? 1 : number(stepText, { ...field, min: 1, max: field.max - field.min + 1 });
    let from; let to;
    if (base === '*') [from, to] = [field.min, field.max];
    else if (base.includes('-')) {
      const [a, b, extra] = base.split('-');
      if (extra !== undefined) fail(`${field.label}: "${base}" לא תקין`);
      [from, to] = [number(a, field), number(b, field)];
      if (from > to) fail(`${field.label}: הטווח ${from}-${to} הפוך`);
    } else {
      from = number(base, field);
      to = stepText === undefined ? from : field.max; // "5/10": from 5 to the end, every 10
    }
    for (let value = from; value <= to; value += step) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

/**
 * @param {string} expression five fields separated by spaces
 * @returns {{minutes:number[], hours:number[], days:Set<number>, months:Set<number>, weekdays:Set<number>, dayAny:boolean, weekAny:boolean}}
 * @throws {Error} with a Hebrew message and `status: 400` when anything is off
 * @example parseCron('*\/15 9-17 * * 1-5').hours // [9, 10, ..., 17]
 */
function parseCron(expression) {
  if (typeof expression !== 'string') fail('ביטוי cron חסר');
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) fail(`ביטוי cron צריך 5 שדות (דקה שעה יום חודש יום-בשבוע), נמצאו ${parts[0] ? parts.length : 0}`);
  const [minutes, hours, days, months, weekdays] = parts.map((part, index) => parseField(part, FIELDS[index]));
  return {
    minutes, hours, days: new Set(days), months: new Set(months), weekdays: new Set(weekdays.map(day => day % 7)),
    dayAny: parts[2].startsWith('*'), weekAny: parts[4].startsWith('*'),
  };
}

function dayMatches(spec, date) {
  if (!spec.months.has(date.getMonth() + 1)) return false;
  const byDay = spec.days.has(date.getDate());
  const byWeek = spec.weekdays.has(date.getDay());
  if (spec.dayAny && spec.weekAny) return true;
  if (spec.dayAny) return byWeek;
  if (spec.weekAny) return byDay;
  return byDay || byWeek;
}

const wallKey = (y, mo, d, h, mi) => Date.UTC(y, mo, d, h, mi);
const wallOf = time => { const date = new Date(time); return wallKey(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()); };

/**
 * The instant a local wall time happens: its first occurrence when repeated, the first minute after the gap when it
 * does not exist.
 * @returns {number} ms
 */
function resolveWall(y, mo, d, h, mi) {
  const time = new Date(y, mo, d, h, mi).getTime();
  const wanted = wallKey(y, mo, d, h, mi);
  if (wallOf(time) === wanted) return time;
  let first = time; // the engine moved a missing time forward; step back while still at or past the wanted wall time
  while (wallOf(first - MINUTE) >= wanted) first -= MINUTE;
  return first;
}

/**
 * @param {ReturnType<typeof parseCron>} spec
 * @param {number} after ms; the result is strictly later
 * @returns {number|null} ms of the next run, null when none within ~9 years (e.g. "0 0 30 2 *")
 * @example nextCron(parseCron('0 9 * * *'), Date.now())
 */
function nextCron(spec, after) {
  const start = new Date(after);
  const [startHour, startMinute] = [start.getHours(), start.getMinutes()];
  for (let offset = 0; offset < SEARCH_DAYS; offset++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 12); // noon: clear of DST shifts
    if (!dayMatches(spec, day)) continue;
    for (const hour of spec.hours) {
      if (offset === 0 && hour < startHour) continue; // earlier wall times of the first day are never later instants
      for (const minute of spec.minutes) {
        if (offset === 0 && hour === startHour && minute < startMinute) continue;
        const time = resolveWall(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
        if (time > after) return time;
      }
    }
  }
  return null;
}

module.exports = { parseCron, nextCron, resolveWall };
