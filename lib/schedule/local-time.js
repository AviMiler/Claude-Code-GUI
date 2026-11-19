/**
 * Local wall-clock time behind ONE injectable helper, so the rule engine (rule-time.js) can be tested with a fake zone
 * that has DST rules of its own (the TZ environment variable is never relied on).
 * A zone is `{ offset(ms) -> minutes east of UTC }`; the default one is the process's local zone.
 * Day numbers are whole days since 1970-01-01 of a LOCAL calendar date (no time zone in them).
 */
const MINUTE = 60000;
const DAY = 86400000;

/** The process's own local zone. */
const SYSTEM_ZONE = { offset: ms => -new Date(ms).getTimezoneOffset() };

/** @returns {number} the day number of a calendar date (month 1–12; overflowing days roll over) */
const dayNumberOf = (y, mo, d) => Math.floor(Date.UTC(y, mo - 1, d) / DAY);

/** @returns {{y:number, mo:number, d:number, wd:number}} the calendar date of a day number (wd 0 = Sunday) */
function dateOfDay(day) {
  const date = new Date(day * DAY);
  return { y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate(), wd: date.getUTCDay() };
}

/** @returns {number} days in a month (1–12) */
const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

/**
 * @param {{offset:(ms:number)=>number}} [zone]
 * @returns {{parts:(ms:number)=>{y:number, mo:number, d:number, h:number, mi:number, wd:number, day:number, minute:number},
 *   resolve:(y:number, mo:number, d:number, h?:number, mi?:number)=>number, dayStart:(day:number)=>number}}
 * @example createLocalTime().resolve(2026, 11, 19, 9, 0) // ms of 19.11.2026 09:00 here
 */
function createLocalTime(zone = SYSTEM_ZONE) {
  const shift = ms => zone.offset(ms) * MINUTE;
  /** The wall time of an instant, floored to the minute, as a UTC-based key. */
  const wallOf = ms => { const wall = ms + shift(ms); return wall - (((wall % MINUTE) + MINUTE) % MINUTE); };

  function parts(ms) {
    const wall = wallOf(ms);
    const date = new Date(wall);
    const [h, mi] = [date.getUTCHours(), date.getUTCMinutes()];
    return { y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate(), h, mi, wd: date.getUTCDay(), day: Math.floor(wall / DAY), minute: h * 60 + mi };
  }

  /**
   * The instant a local wall time happens: its FIRST occurrence when repeated (fall back), the first valid minute
   * after the gap when it does not exist (spring forward).
   */
  function resolve(y, mo, d, h = 0, mi = 0) {
    const wanted = Date.UTC(y, mo - 1, d, h, mi);
    const offsets = [...new Set([shift(wanted - DAY), shift(wanted), shift(wanted + DAY)])];
    const valid = offsets.map(offset => wanted - offset).filter(time => wallOf(time) === wanted);
    if (valid.length) return Math.min(...valid);
    let time = wanted - Math.min(...offsets); // inside the gap: its wall time is past the wanted one
    while (wallOf(time - MINUTE) >= wanted) time -= MINUTE;
    return time;
  }

  const dayStart = day => { const { y, mo, d } = dateOfDay(day); return resolve(y, mo, d, 0, 0); };
  return { parts, resolve, dayStart };
}

const systemTime = createLocalTime();

module.exports = { createLocalTime, systemTime, dayNumberOf, dateOfDay, daysInMonth, MINUTE, DAY };
