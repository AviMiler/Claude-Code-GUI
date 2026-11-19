/**
 * "מתי": the pattern of a flexible (`rule`) schedule. Fixed times of day (a list, or N times spread evenly between
 * two hours), every N minutes / hours from a start date and time, or once at a date and time.
 */
import { h } from '../dom.js';
import { field, select } from '../panels/kit.js';
import { timeInput, dateInput, numberInput, group, rowList, localDate, localTime, toMs } from './schedule-controls.js';

const TYPES = [{ value: 'times', label: 'בשעות קבועות ביום' }, { value: 'interval', label: 'כל כמה דקות / שעות' }, { value: 'once', label: 'פעם אחת' }];
const UNITS = [{ value: 'minutes', label: 'דקות' }, { value: 'hours', label: 'שעות' }];
const MAX_TIMES = 24;

/** The next full hour from now: the default start of an interval and the default once. */
const nextHour = () => { const date = new Date(); date.setHours(date.getHours() + 1, 0, 0, 0); return date.getTime(); };

/**
 * @param {object} initial the rule's pattern
 * @param {(type:string)=>void} onType called when the pattern type changes (the days section hides for once)
 * @returns {{node:HTMLElement, value:()=>object, set:(pattern:object)=>void, type:()=>string}}
 */
export function patternSection(initial, onType) {
  const type = select(TYPES, initial.type);

  const times = rowList({ make: (value = '12:00') => { const input = timeInput(value); return { node: input, value: () => input.value }; }, addLabel: 'הוספת שעה', max: MAX_TIMES, min: 1 });
  const spreadOn = h('input', { type: 'checkbox' });
  const spread = { count: numberInput(4, 2, MAX_TIMES), from: timeInput('09:00'), to: timeInput('18:00') };
  const spreadBox = group('פיזור שווה', spread.count, h('span', null, 'פעמים, בין'), spread.from, h('span', null, 'ל-'), spread.to);
  const showSpread = () => { spreadBox.hidden = !spreadOn.checked; times.node.hidden = spreadOn.checked; };
  spreadOn.addEventListener('change', showSpread);
  const timesPart = h('div', { class: 'schedule-part' },
    times.node, h('label', { class: 'schedule-check' }, spreadOn, 'במקום רשימה: לפזר מספר פעמים באופן שווה בין שתי שעות'), spreadBox);

  const every = numberInput(1, 1, 1440);
  const unit = select(UNITS, 'hours');
  const startDate = dateInput();
  const startTime = timeInput();
  const intervalPart = h('div', { class: 'schedule-part' },
    group('כל', every, unit),
    group('החל מ-', startDate, startTime),
    h('p', { class: 'schedule-note' }, 'מרווח קבוע בזמן: במעבר לשעון קיץ או חורף השעה בשעון זזה בשעה. מינימום 5 דקות.'));

  const onceDate = dateInput();
  const onceTime = timeInput();
  const oncePart = h('div', { class: 'schedule-part' }, group('בתאריך ובשעה', onceDate, onceTime));
  const parts = { times: timesPart, interval: intervalPart, once: oncePart };

  const show = () => { for (const [name, node] of Object.entries(parts)) node.hidden = name !== type.value; onType(type.value); };
  type.addEventListener('change', show);

  function set(pattern) {
    type.value = pattern.type || 'times';
    times.set(pattern.type === 'times' && pattern.times?.length && !pattern.spread ? pattern.times : ['09:00']);
    spreadOn.checked = Boolean(pattern.spread);
    if (pattern.spread) { spread.count.value = pattern.spread.count; spread.from.value = pattern.spread.from; spread.to.value = pattern.spread.to; }
    const start = pattern.type === 'interval' && Number.isFinite(pattern.start) ? pattern.start : nextHour();
    every.value = pattern.type === 'interval' ? pattern.every : 1;
    unit.value = pattern.type === 'interval' ? pattern.unit : 'hours';
    [startDate.value, startTime.value] = [localDate(start), localTime(start)];
    const at = pattern.type === 'once' && Number.isFinite(pattern.at) ? pattern.at : nextHour();
    [onceDate.value, onceTime.value] = [localDate(at), localTime(at)];
    showSpread();
    show();
  }

  function value() {
    if (type.value === 'interval') return { type: 'interval', every: Number(every.value), unit: unit.value, start: toMs(startDate.value, startTime.value) };
    if (type.value === 'once') return { type: 'once', at: toMs(onceDate.value, onceTime.value) };
    if (spreadOn.checked) return { type: 'times', spread: { count: Number(spread.count.value), from: spread.from.value, to: spread.to.value } };
    return { type: 'times', times: times.value() };
  }

  set(initial);
  return { node: h('fieldset', { class: 'schedule-section' }, h('legend', null, 'מתי'), field('חזרה', type), timesPart, intervalPart, oncePart), value, set, type: () => type.value };
}
