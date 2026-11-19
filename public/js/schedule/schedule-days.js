/**
 * "ימים": which days a flexible (`rule`) schedule runs on. Days of the week, every N days from a date, days of the
 * month (with "אחרון") and months. Nothing chosen = every day; several parts must all hold together (AND).
 */
import { h } from '../dom.js';
import { chips, group, numberInput, dateInput, localDate } from './schedule-controls.js';

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map((label, value) => ({ value, label }));
const MONTH_DAYS = [...Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: String(index + 1) })), { value: 'last', label: 'אחרון', title: 'היום האחרון בחודש' }];
const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'].map((label, index) => ({ value: index + 1, label }));

/**
 * @param {object} initial the rule's days ({ every?, weekdays?, monthDays?, months? })
 * @returns {{node:HTMLElement, value:()=>object, set:(days:object)=>void}}
 */
export function daysSection(initial) {
  const weekdays = chips(WEEKDAYS, [], 'ימים בשבוע');
  const everyOn = h('input', { type: 'checkbox' });
  const everyN = numberInput(2, 1, 365);
  const everyFrom = dateInput();
  const monthDays = chips(MONTH_DAYS, [], 'ימים בחודש');
  monthDays.node.classList.add('schedule-month-grid');
  const months = chips(MONTHS, [], 'חודשים');

  function set(days = {}) {
    weekdays.set(days.weekdays || []);
    everyOn.checked = Boolean(days.every);
    everyN.value = days.every?.n || 2;
    everyFrom.value = days.every?.from || localDate(Date.now());
    monthDays.set(days.monthDays || []);
    months.set(days.months || []);
  }

  function value() {
    const days = {};
    if (everyOn.checked) days.every = { n: Number(everyN.value), from: everyFrom.value };
    for (const [key, control] of [['weekdays', weekdays], ['monthDays', monthDays], ['months', months]]) {
      const chosen = control.value();
      if (chosen.length) days[key] = chosen;
    }
    return days;
  }

  set(initial);
  return {
    node: h('fieldset', { class: 'schedule-section' }, h('legend', null, 'ימים'),
      h('p', { class: 'schedule-note' }, 'בלי בחירה: כל יום. כשבוחרים כמה תנאים, הריצה רק בימים שמקיימים את כולם יחד.'),
      group('ימים בשבוע', weekdays.node),
      group('כל כמה ימים', h('label', { class: 'schedule-check' }, everyOn, 'כל'), everyN, h('span', null, 'ימים, החל מ-'), everyFrom),
      group('ימים בחודש', monthDays.node),
      group('חודשים', months.node)),
    value, set,
  };
}
