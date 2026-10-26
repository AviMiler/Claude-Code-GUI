/** /status, /doctor, /version: what is running, health checks, account; plus appearance (/theme). */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { applyTheme, themePreference } from '../ui.js';
import { section, kv, button, load, cliOutput, badge } from './kit.js';

export function renderStatusPanel(body, context) {
  const { capabilities, config, session } = context;
  const runtime = session ? context.runtimeInfo(session.id) : null;
  body.append(section('ממשק וגרסה', null, kv([
    ['גרסת Claude Code', capabilities.version || 'לא זוהתה'],
    ['קובץ ההרצה', h('code', { dir: 'ltr' }, config.claudePath)],
    ['מודל ברירת מחדל (config.json)', config.model || '(של Claude Code)'],
    ['מצבי הרשאה שהגרסה תומכת בהם', capabilities.permissionModes.join(', ')],
    ['תיקייה', h('code', { dir: 'ltr' }, context.folder)],
    ...(session ? [['מזהה שיחה', session.claudeSessionId || '(טרם התחילה)']] : []),
    ...(runtime?.model ? [['מודל בפועל', runtime.model], ['כלים זמינים', String(runtime.tools ?? '—')]] : []),
  ])));
  if (capabilities.error) body.append(h('div', { class: 'error-box' }, `לא ניתן להריץ את Claude Code: ${capabilities.error}`));

  const statusBox = h('div');
  body.append(section('סטטוס מ-Claude Code (/status)', null, statusBox));
  load(statusBox, () => context.api.control(context.scope, 'get_status'), status => (status.sections || []).map(part =>
    section(part.title, null, kv((part.rows || []).map(item => [item.label, item.value]))))) ;

  const doctorBox = h('div');
  const authBox = h('div');
  body.append(section('אבחון (/doctor)', 'בודק התקנה, עדכונים, הגדרות מנוהלות וחיבור.',
    h('div', { class: 'panel-toolbar' },
      button('הרצת claude doctor', () => load(doctorBox, () => context.api.cli(['doctor'], context.folder), cliOutput), { variant: 'primary', iconName: 'activity' }),
      button('בדיקה מלאה עם תיקונים (Skill /doctor)', () => { context.close(); context.send('/doctor'); }, { iconName: 'sparkles' }),
      button('סטטוס התחברות', () => load(authBox, () => context.api.cli(['auth', 'status', '--text'], context.folder), cliOutput), { iconName: 'user' })),
    doctorBox, authBox));
}

export function renderAppearancePanel(body, context) {
  const current = themePreference();
  const options = [{ value: 'system', label: 'לפי המערכת', icon: 'monitor' }, { value: 'light', label: 'בהיר', icon: 'sun' }, { value: 'dark', label: 'כהה', icon: 'moon' }];
  body.append(section('ערכת נושא (/theme)', null, h('div', { class: 'radio-cards' }, options.map(option => h('button', {
    type: 'button', class: `radio-card${option.value === current ? ' on' : ''}`, onClick: () => { applyTheme(option.value); context.rerender(); },
  }, icon(option.icon), h('b', null, option.label), option.value === current ? badge('נבחר', 'accent') : h('span'))))));
  body.append(section('תצוגה ממוקדת (/focus)', 'מסתיר קריאות כלים, חשיבה והודעות מערכת – רק השיחה עצמה.',
    button(context.focusView() ? 'כיבוי תצוגה ממוקדת' : 'הפעלת תצוגה ממוקדת', () => { context.toggleFocus(); context.rerender(); }, { small: false, iconName: 'focus' })));
}
