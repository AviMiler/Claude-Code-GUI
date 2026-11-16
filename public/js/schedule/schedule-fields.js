/**
 * The schedule part of the task form: the kind, its own fields, and a live line with the next three runs (or what is
 * wrong), checked by the server as the user types (POST /api/schedules/preview).
 */
import { h } from '../dom.js';
import { field, select } from '../panels/kit.js';
import { formatTime } from './schedule-labels.js';

const KINDS = [
  { value: 'manual', label: 'ידני בלבד' }, { value: 'hours', label: 'כל כמה שעות' }, { value: 'daily', label: 'כל יום' },
  { value: 'weekdays', label: 'ימי עבודה (א׳–ה׳)' }, { value: 'weekly', label: 'בימים מסוימים בשבוע' }, { value: 'cron', label: 'ביטוי cron מותאם' },
];
const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/**
 * @param {object} initial the stored schedule (or a default)
 * @param {{preview:(schedule:object)=>Promise<{text:string, next:number[]}>}} scheduleApi
 * @returns {{node:HTMLElement, value:()=>object}}
 */
export function scheduleFields(initial, scheduleApi) {
  const kind = select(KINDS, initial.kind);
  const time = h('input', { type: 'time', value: initial.time || '09:00', dir: 'ltr' });
  const every = h('input', { type: 'number', min: 1, max: 24, step: 1, value: initial.every || 1, dir: 'ltr' });
  const expression = h('input', { value: initial.expression || '0 9 * * 0-4', dir: 'ltr', spellcheck: false, placeholder: 'דקה שעה יום חודש יום-בשבוע' });
  const dayBoxes = DAYS.map((label, day) => h('input', { type: 'checkbox', value: String(day), checked: (initial.days || [0]).includes(day) }));
  const days = h('div', { class: 'schedule-days', role: 'group', 'aria-label': 'ימים' }, dayBoxes.map((box, day) => h('label', null, box, DAYS[day])));
  const parts = {
    hours: field('כל כמה שעות (1–24)', every), daily: field('שעה', time), weekdays: field('שעה', time), weekly: [field('ימים', days), field('שעה', time)],
    cron: field('ביטוי cron (שעון מקומי)', expression, { wide: true, hint: 'דקה שעה יום-בחודש חודש יום-בשבוע (0=ראשון). תומך ב-* , - /' }),
  };
  const holder = h('div', { class: 'schedule-parts' });
  const preview = h('div', { class: 'schedule-preview', 'aria-live': 'polite' });

  const value = () => {
    const chosen = kind.value;
    if (chosen === 'hours') return { kind: chosen, every: Number(every.value) };
    if (chosen === 'weekly') return { kind: chosen, days: dayBoxes.filter(box => box.checked).map(box => Number(box.value)), time: time.value };
    if (chosen === 'cron') return { kind: chosen, expression: expression.value };
    return chosen === 'manual' ? { kind: chosen } : { kind: chosen, time: time.value };
  };

  let timer = null; let asked = 0;
  async function check() {
    const ticket = ++asked;
    try {
      const result = await scheduleApi.preview(value());
      if (ticket !== asked) return;
      preview.className = 'schedule-preview';
      preview.replaceChildren(result.next.length ? `${result.text}. הריצות הבאות: ${result.next.map(formatTime).join(' · ')}` : `${result.text}: רץ רק ב"הרץ עכשיו".`);
    } catch (error) {
      if (ticket !== asked) return;
      preview.className = 'schedule-preview invalid';
      preview.textContent = error.message;
    }
  }
  const changed = () => { clearTimeout(timer); timer = setTimeout(check, 250); };

  function show() {
    holder.replaceChildren(...[].concat(parts[kind.value] || []));
    changed();
  }
  kind.addEventListener('change', show);
  for (const input of [time, every, expression, ...dayBoxes]) input.addEventListener('input', changed);
  show();
  return { node: h('div', { class: 'schedule-fields' }, field('תזמון', kind), holder, preview), value };
}
