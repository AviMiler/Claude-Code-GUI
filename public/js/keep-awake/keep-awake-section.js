/** The "מניעת שינה" section of the status panel: the switch kept in the data folder and what the server says now. */
import { h } from '../dom.js';
import { section, badge, errorBox } from '../panels/kit.js';

/** @returns {[string, string]} the status line and its badge tone */
export function keepAwakeLine({ enabled, active, available, reason }) {
  if (!available) return [`לא זמין: ${reason || 'סיבה לא ידועה'}`, 'danger'];
  if (!enabled) return ['כבוי', ''];
  return active ? ['פעיל עכשיו', 'success'] : ['לא פעיל', ''];
}

/**
 * @param {{api:{keepAwake:Function, setKeepAwake:Function}}} context
 * @returns {HTMLElement} the section; it fills itself from GET /api/keep-awake
 */
export function keepAwakeSection(context) {
  const box = h('div');
  const draw = info => {
    const [text, tone] = keepAwakeLine(info);
    const input = h('input', { type: 'checkbox', checked: info.enabled, onChange: async () => {
      input.disabled = true;
      try { draw(await context.api.setKeepAwake(input.checked)); } catch (error) { box.replaceChildren(errorBox(error)); }
    } });
    box.replaceChildren(
      h('label', { class: 'check-row' }, input, h('span', null, h('b', null, 'מניעת שינה בזמן ש-Claude עובד'),
        h('small', null, 'המחשב לא נכנס למצב שינה בזמן שסשן רץ או ממתין לאישור, וגם בזמן משימה מתוזמנת; המסך עדיין יכול לכבות. משתחרר כחצי דקה אחרי הסיום.'))),
      h('div', { class: 'panel-toolbar' }, badge(text, tone)),
      h('small', { class: 'hint' }, 'מגבלה: סגירת מכסה של מחשב נייד עדיין מרדימה אותו.'));
  };
  context.api.keepAwake().then(draw).catch(error => box.replaceChildren(errorBox(error)));
  return section('שינה', null, box);
}
