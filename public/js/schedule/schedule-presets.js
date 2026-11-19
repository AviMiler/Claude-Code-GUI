/**
 * Starting points of the flexible schedule form: the preset chips, the default of a new task, and the conversion of a
 * stored old-kind schedule into the form's `rule` (on edit only; nothing is rewritten until the user saves).
 * An old 'hours' task becomes an interval with start = its anchor, so its run times stay identical.
 */
const WORK_WEEK = [0, 1, 2, 3, 4];
const rule = (pattern, extra = {}) => ({ kind: 'rule', v: 1, pattern, days: {}, catchUp: 'latest', ...extra });
const today = hour => { const date = new Date(); date.setHours(hour, 0, 0, 0); return date.getTime(); };

/** @type {{label:string, make:()=>object}[]} */
export const PRESETS = [
  { label: 'כל יום 09:00', make: () => rule({ type: 'times', times: ['09:00'] }) },
  { label: 'ימים א–ה 09:00', make: () => rule({ type: 'times', times: ['09:00'] }, { days: { weekdays: WORK_WEEK } }) },
  { label: 'כמה פעמים ביום', make: () => rule({ type: 'times', times: ['09:00', '13:00', '17:00'] }) },
  { label: 'כל שעה בשעות עבודה', make: () => rule({ type: 'interval', every: 1, unit: 'hours', start: today(9) },
    { days: { weekdays: WORK_WEEK }, windows: { mode: 'only', ranges: [{ from: '09:00', to: '18:00' }], onExcluded: 'skip' } }) },
  { label: 'כל 3 שעות, לא בלילה', make: () => rule({ type: 'interval', every: 3, unit: 'hours', start: today(8) },
    { windows: { mode: 'except', ranges: [{ from: '22:00', to: '07:00' }], onExcluded: 'skip' } }) },
];

/** @returns {object} the schedule of a new task */
export const defaultSchedule = () => PRESETS[0].make();

/**
 * @param {object} schedule a stored schedule
 * @returns {object} the same schedule as the form shows it: old simple kinds as a rule; rule, cron and manual as they are
 * @example toFormSchedule({ kind: 'weekdays', time: '08:30' }).days // { weekdays: [0, 1, 2, 3, 4] }
 */
export function toFormSchedule(schedule) {
  switch (schedule?.kind) {
    case 'hours': return rule({ type: 'interval', every: schedule.every, unit: 'hours', start: schedule.anchor });
    case 'daily': return rule({ type: 'times', times: [schedule.time] });
    case 'weekdays': return rule({ type: 'times', times: [schedule.time] }, { days: { weekdays: WORK_WEEK } });
    case 'weekly': return rule({ type: 'times', times: [schedule.time] }, { days: { weekdays: [...schedule.days] } });
    case 'rule': case 'cron': case 'manual': return schedule;
    default: return defaultSchedule();
  }
}
