/** A schedule in Hebrew words for the task list ("כל יום ב-09:00"), and the date label of a run's session title. */
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const pad = value => String(value).padStart(2, '0');

/**
 * @param {object} schedule see schedule-time.js
 * @returns {string}
 * @example describeSchedule({ kind: 'weekly', days: [0, 3], time: '08:30' }) // 'כל שבוע בימי ראשון, רביעי ב-08:30'
 */
function describeSchedule(schedule) {
  switch (schedule.kind) {
    case 'manual': return 'ידני בלבד';
    case 'hours': return schedule.every === 1 ? 'כל שעה' : `כל ${schedule.every} שעות`;
    case 'daily': return `כל יום ב-${schedule.time}`;
    case 'weekdays': return `בימי א׳–ה׳ ב-${schedule.time}`;
    case 'weekly': return `כל שבוע בימי ${[...schedule.days].sort().map(day => DAY_NAMES[day]).join(', ')} ב-${schedule.time}`;
    case 'cron': return `cron: ${schedule.expression}`;
    default: return '';
  }
}

/** @param {number} time ms @returns {string} "16.11.2026 09:00" in local time */
function dateLabel(time) {
  const date = new Date(time);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

module.exports = { describeSchedule, dateLabel, DAY_NAMES };
