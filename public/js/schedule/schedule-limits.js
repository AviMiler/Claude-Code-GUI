/**
 * "הגבלות" (collapsed): hour windows the rule runs only in / never in (with skip or delay for a time that falls
 * outside), excluded dates, a date range, a maximum number of runs, and whether a missed run is caught up.
 */
import { h } from '../dom.js';
import { select } from '../panels/kit.js';
import { group, rowList, dateList, dateInput, numberInput, timeInput } from './schedule-controls.js';

const MODES = [{ value: '', label: 'בכל שעה' }, { value: 'only', label: 'רק בשעות האלה' }, { value: 'except', label: 'לא בשעות האלה (שעות שקטות)' }];
const ON_EXCLUDED = [{ value: 'skip', label: 'לדלג עליה' }, { value: 'delay', label: 'לדחות לסוף החלון (פעם אחת)' }];

function windowRow(range = { from: '09:00', to: '18:00' }) {
  const from = timeInput(range.from);
  const to = timeInput(range.to);
  return { node: h('div', { class: 'schedule-inline' }, h('span', null, 'בין'), from, h('span', null, 'ל-'), to), value: () => ({ from: from.value, to: to.value }) };
}

/**
 * @param {object} initial the rule (windows, excludeDates, range, maxRuns, catchUp)
 * @returns {{node:HTMLElement, value:()=>object, set:(rule:object)=>void}}
 */
export function limitsSection(initial) {
  const mode = select(MODES, '');
  const ranges = rowList({ make: windowRow, addLabel: 'הוספת חלון', max: 6, min: 1 });
  const onExcluded = select(ON_EXCLUDED, 'skip');
  const windowParts = h('div', { class: 'schedule-part' }, ranges.node, group('ריצה שנופלת מחוץ לשעות', onExcluded),
    h('p', { class: 'schedule-note' }, 'חלון יכול לעבור את חצות (למשל 22:00 עד 06:00). שעת הסיום עצמה כבר מחוץ לחלון.'));
  const showWindows = () => { windowParts.hidden = !mode.value; };
  mode.addEventListener('change', showWindows);
  const excluded = dateList(366);
  const from = dateInput();
  const until = dateInput();
  const maxRuns = numberInput('', 1, 9999);
  maxRuns.classList.add('wide');
  maxRuns.placeholder = 'ללא הגבלה';
  const catchUp = h('input', { type: 'checkbox' });
  const details = h('details', { class: 'schedule-section schedule-limits' }, h('summary', null, 'הגבלות'),
    group('שעות', mode), windowParts,
    group('תאריכים שבהם לא לרוץ', excluded.node),
    group('רק בין התאריכים', h('span', null, 'מ-'), from, h('span', null, 'עד'), until),
    group('מספר הרצות מרבי', maxRuns, h('span', { class: 'schedule-note' }, 'אחריו המשימה מסתיימת')),
    h('label', { class: 'schedule-check' }, catchUp, 'להשלים ריצה שהוחמצה (פעם אחת, עד 7 ימים אחורה)'));

  function set(rule = {}) {
    mode.value = rule.windows?.mode || '';
    ranges.set(rule.windows?.ranges?.length ? rule.windows.ranges : [undefined]);
    onExcluded.value = rule.windows?.onExcluded || 'skip';
    excluded.set(rule.excludeDates || []);
    from.value = rule.range?.from || '';
    until.value = rule.range?.until || '';
    maxRuns.value = rule.maxRuns || '';
    catchUp.checked = rule.catchUp !== 'none';
    details.open = Boolean(rule.windows || rule.excludeDates?.length || rule.range || rule.maxRuns || rule.catchUp === 'none');
    showWindows();
  }

  function value() {
    const rule = { catchUp: catchUp.checked ? 'latest' : 'none' };
    if (mode.value) rule.windows = { mode: mode.value, ranges: ranges.value(), onExcluded: onExcluded.value };
    if (excluded.value().length) rule.excludeDates = excluded.value();
    if (from.value || until.value) rule.range = { ...(from.value && { from: from.value }), ...(until.value && { until: until.value }) };
    if (maxRuns.value !== '') rule.maxRuns = Number(maxRuns.value);
    return rule;
  }

  set(initial);
  return { node: details, value, set };
}
