/**
 * The schedule part of the task form: flexible (`rule`, the default: "מתי", "ימים", "הגבלות" with preset chips),
 * an advanced cron expression, or manual only, plus the always-visible preview checked by the server as the user types.
 */
import { h } from '../dom.js';
import { field, select } from '../panels/kit.js';
import { patternSection } from './schedule-pattern.js';
import { daysSection } from './schedule-days.js';
import { limitsSection } from './schedule-limits.js';
import { schedulePreview, BUSY_PER_DAY } from './schedule-preview.js';
import { PRESETS, defaultSchedule, toFormSchedule } from './schedule-presets.js';

const KINDS = [{ value: 'rule', label: 'תזמון גמיש' }, { value: 'cron', label: 'ביטוי cron (מתקדם)' }, { value: 'manual', label: 'ידני בלבד' }];
const SHORT_INTERVAL_MINUTES = 60;

/**
 * @param {object} initial the stored schedule (or a default)
 * @param {{preview:(schedule:object)=>Promise<{text:string, next:number[], delayed?:boolean[], perDay?:number}>}} scheduleApi
 * @returns {{node:HTMLElement, value:()=>object, risks:(mode:string)=>Promise<string[]>}} risks: reasons to confirm the save
 */
export function scheduleFields(initial, scheduleApi) {
  const start = toFormSchedule(initial);
  const ruleStart = start.kind === 'rule' ? start : defaultSchedule();
  const kind = select(KINDS, start.kind);
  const days = daysSection(ruleStart.days);
  const limits = limitsSection(ruleStart);
  const pattern = patternSection(ruleStart.pattern, type => { days.node.hidden = type === 'once'; limits.node.hidden = type === 'once'; });
  const presets = h('div', { class: 'schedule-presets', role: 'group', 'aria-label': 'תבניות מוכנות' },
    h('span', null, 'תבניות:'), PRESETS.map(preset => h('button', { type: 'button', class: 'schedule-chip', onClick: () => apply(preset.make()) }, preset.label)));
  const ruleBody = h('div', { class: 'schedule-rule' }, presets, pattern.node, days.node, limits.node);
  const expression = h('input', { value: start.expression || '0 9 * * 0-4', dir: 'ltr', spellcheck: false, placeholder: 'דקה שעה יום חודש יום-בשבוע' });
  const cronBody = field('ביטוי cron (שעון מקומי)', expression, { wide: true, hint: 'דקה שעה יום-בחודש חודש יום-בשבוע (0=ראשון). תומך ב-* , - /. יום בחודש ויום בשבוע יחד: מספיק שאחד מתקיים.' });

  const value = () => {
    if (kind.value === 'cron') return { kind: 'cron', expression: expression.value };
    if (kind.value === 'manual') return { kind: 'manual' };
    const rule = { kind: 'rule', v: 1, pattern: pattern.value(), ...limits.value() };
    if (rule.pattern.type !== 'once') rule.days = days.value();
    return rule;
  };
  const preview = schedulePreview(scheduleApi, value);
  const show = () => { ruleBody.hidden = kind.value !== 'rule'; cronBody.hidden = kind.value !== 'cron'; preview.changed(); };

  function apply(rule) {
    kind.value = 'rule';
    pattern.set(rule.pattern);
    days.set(rule.days);
    limits.set(rule);
    show();
  }

  /** Reasons to ask before saving: a very busy schedule, or a short interval that runs without asking. */
  async function risks(mode) {
    const schedule = value();
    if (schedule.kind !== 'rule') return [];
    const reasons = [];
    const { perDay = 0 } = await preview.fetch();
    if (perDay > BUSY_PER_DAY) reasons.push(`≈ ${perDay} הרצות ביום. כל ריצה היא סשן חדש שמשתמש במודל.`);
    const { type, every, unit } = schedule.pattern;
    const minutes = unit === 'hours' ? every * 60 : every;
    if (type === 'interval' && minutes < SHORT_INTERVAL_MINUTES && ['bypassPermissions', 'auto'].includes(mode)) {
      reasons.push(`ריצה כל ${minutes} דקות במצב שמאשר פעולות בלי לשאול.`);
    }
    return reasons;
  }

  kind.addEventListener('change', show);
  const node = h('div', { class: 'schedule-fields' }, field('תזמון', kind), ruleBody, cronBody, h('div', { class: 'schedule-preview-box' }, h('strong', null, 'תצוגה מקדימה'), preview.node));
  node.addEventListener('input', preview.changed);
  node.addEventListener('change', preview.changed);
  show();
  return { node, value, risks };
}
