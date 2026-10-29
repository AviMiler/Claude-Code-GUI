/** /model panel, "fallback model": the model the CLI switches to when the main one is overloaded (--fallback-model). */
import { h } from '../dom.js';
import { section, button } from './kit.js';

/**
 * @param {{session:object, models:{value:string}[], current:string, supported:boolean, apply:(patch:object)=>Promise<void>,
 *   toast:(message:string, type?:string)=>void}} options current: the main model; supported: the installed CLI has the flag
 * @returns {HTMLElement}
 */
export function fallbackSection({ session, models, current, supported, apply, toast }) {
  const lead = 'מודל חלופי שהמערכת עוברת אליו כשהמודל הראשי עמוס. נכנס לתוקף בהודעה הבאה (Claude Code מופעל מחדש עם השיחה הקיימת). המודל חייב להיות זמין באותו שרת.';
  if (!supported) return section('מודל גיבוי (fallback)', lead, h('p', { class: 'detail-muted' }, 'הגרסה המותקנת של Claude Code לא תומכת בכך (אין --fallback-model).'));
  const choices = models.filter(model => model.value !== current && model.value !== 'default');
  const list = h('datalist', { id: 'fallback-models' }, choices.map(model => h('option', { value: model.value })));
  const input = h('input', { list: 'fallback-models', dir: 'ltr', placeholder: 'שם מודל, למשל qwen3.8:7b', value: session.fallbackModel || '' });
  const save = value => apply({ fallbackModel: value }).catch(error => toast(error.message, 'error'));
  const same = session.fallbackModel && session.fallbackModel === current;
  return section('מודל גיבוי (fallback)', lead, list, same ? h('p', { class: 'detail-muted' }, 'מודל הגיבוי זהה למודל הראשי, ולכן לא יישלח ל-Claude Code. בחר מודל אחר.') : null,
    h('div', { class: 'panel-toolbar' }, input, button('שמירה', () => save(input.value.trim()), { variant: 'primary' }),
      session.fallbackModel ? button('ניקוי', () => save(''), { variant: 'danger' }) : null));
}
