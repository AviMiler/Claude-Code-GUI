/**
 * A `rule` schedule in Hebrew words, e.g. "כל 90 דקות החל מ-08:00, רק בין 09:00 ל-18:00, בימי ראשון עד חמישי,
 * ללא התאריכים 01.01.2027, עד 12 הרצות". The day conditions combine by AND and the text says so.
 */
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const pad = value => String(value).padStart(2, '0');
const clock = time => { const date = new Date(time); return `${pad(date.getHours())}:${pad(date.getMinutes())}`; };
const dayLabel = text => text.split('-').reverse().join('.'); // 2026-11-19 -> 19.11.2026
const fullLabel = time => { const date = new Date(time); return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${clock(time)}`; };

/** "ראשון עד חמישי" for a run of 3+ days in a row, otherwise a list. */
function weekdayText(days) {
  const run = days.length >= 3 && days.every((day, index) => index === 0 || day === days[index - 1] + 1);
  return run ? `${DAY_NAMES[days[0]]} עד ${DAY_NAMES[days.at(-1)]}` : days.map(day => DAY_NAMES[day]).join(', ');
}

function patternText(pattern, now) {
  if (pattern.type === 'once') return `פעם אחת ב-${fullLabel(pattern.at)}`;
  if (pattern.type === 'times') {
    const list = pattern.times.join(', ');
    return pattern.spread ? `${pattern.spread.count} פעמים ביום בין ${pattern.spread.from} ל-${pattern.spread.to} (${list})` : `ב-${list}`;
  }
  const amount = pattern.unit === 'hours'
    ? (pattern.every === 1 ? 'כל שעה' : `כל ${pattern.every} שעות`)
    : `כל ${pattern.every} דקות`;
  const start = pattern.start > now + 86400000 ? fullLabel(pattern.start) : clock(pattern.start);
  return `${amount} החל מ-${start} (מרווח קבוע: במעבר שעון קיץ/חורף השעות זזות)`;
}

function daysParts(days = {}) {
  const parts = [];
  if (days.every) parts.push(days.every.n === 1 ? `כל יום החל מ-${dayLabel(days.every.from)}` : `כל ${days.every.n} ימים החל מ-${dayLabel(days.every.from)}`);
  if (days.weekdays) parts.push(`בימי ${weekdayText(days.weekdays)}`);
  if (days.monthDays) parts.push(`ב-${days.monthDays.map(day => (day === 'last' ? 'אחרון' : day)).join(', ')} בחודש`);
  if (days.months) parts.push(`בחודשים ${days.months.map(month => MONTH_NAMES[month - 1]).join(', ')}`);
  return parts;
}

function windowsText(windows) {
  const ranges = windows.ranges.map(range => `בין ${range.from} ל-${range.to}`).join(' או ');
  const base = windows.mode === 'only' ? `רק ${ranges}` : `לא ${ranges}`;
  return windows.onExcluded === 'delay' ? `${base} (ריצה שנופלת מחוץ לשעות נדחית לסוף החלון)` : base;
}

/**
 * @param {object} schedule a validated rule schedule
 * @param {number} [now] ms; a start more than a day ahead is shown with its date
 * @returns {string}
 */
function describeRule(schedule, now = Date.now()) {
  const days = daysParts(schedule.days);
  const parts = [patternText(schedule.pattern, now)];
  if (schedule.pattern.type === 'times' && !schedule.pattern.spread && !days.length) parts[0] = `כל יום ${parts[0]}`;
  if (schedule.windows) parts.push(windowsText(schedule.windows));
  if (days.length) parts.push(days.length > 1 ? `${days.join(' וגם ')} (רק כשכל תנאי הימים מתקיימים יחד)` : days[0]);
  const excluded = schedule.excludeDates || [];
  if (excluded.length) parts.push(`ללא התאריכים ${excluded.slice(0, 3).map(dayLabel).join(', ')}${excluded.length > 3 ? ` ועוד ${excluded.length - 3}` : ''}`);
  if (schedule.range?.from) parts.push(`מ-${dayLabel(schedule.range.from)}`);
  if (schedule.range?.until) parts.push(`עד ${dayLabel(schedule.range.until)}`);
  if (schedule.maxRuns) parts.push(`עד ${schedule.maxRuns} הרצות`);
  if (schedule.catchUp === 'none') parts.push('בלי השלמת ריצות שהוחמצו');
  return parts.join(', ');
}

module.exports = { describeRule, DAY_NAMES };
