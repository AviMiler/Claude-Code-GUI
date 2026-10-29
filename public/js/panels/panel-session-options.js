/** /color and the session options: extended thinking, the session's own system prompt, safe mode, and the session's color. */
import { h } from '../dom.js';
import { section, button, empty } from './kit.js';
import { COLORS } from '../session-color/palette.js';

const checkbox = (label, checked, onChange) => {
  const box = h('input', { type: 'checkbox', checked });
  box.addEventListener('change', () => onChange(box.checked));
  return h('label', { class: 'option-check' }, box, label);
};

function promptSection(session, flags, apply, toast) {
  const lead = 'הנחיות שנוספות להנחיית המערכת של Claude Code בסשן הזה, למשל "ענה תמיד בעברית". נכנס לתוקף בהודעה הבאה (Claude Code מופעל מחדש עם השיחה הקיימת).';
  if (!flags.includes('--append-system-prompt-file')) {
    return section('הנחיית מערכת', lead, h('p', { class: 'detail-muted' }, 'הגרסה המותקנת של Claude Code לא תומכת בכך (אין --append-system-prompt-file).'));
  }
  const replace = session.systemPromptMode === 'replace';
  const area = h('textarea', { rows: 6, dir: 'auto', maxLength: 20000, placeholder: 'ההנחיות שלך…' }, session.systemPrompt || '');
  const mode = value => h('label', { class: 'option-check' }, h('input', { type: 'radio', name: 'prompt-mode', value, checked: (value === 'replace') === replace,
    disabled: value === 'replace' && !flags.includes('--system-prompt-file') }), value === 'replace' ? 'החלפה של הנחיית המערכת (מסיר גם את ההנחיות של Claude Code לכלים)' : 'הוספה להנחיית המערכת (מומלץ)');
  const modes = h('div', { class: 'option-group' }, mode('append'), mode('replace'));
  const save = patch => apply(patch).catch(error => toast(error.message, 'error'));
  return section('הנחיית מערכת', lead, area, modes,
    h('div', { class: 'panel-toolbar', style: 'margin-top:8px' },
      button('שמירה', () => save({ systemPrompt: area.value, systemPromptMode: modes.querySelector('input:checked')?.value || 'append' }), { variant: 'primary' }),
      session.systemPrompt ? button('ניקוי', () => save({ systemPrompt: '' }), { variant: 'danger' }) : null));
}

export function renderSessionOptionsPanel(body, context) {
  const { session } = context;
  if (!session) { body.append(empty('אפשרויות הסשן שייכות לסשן. פתח או צור סשן כדי לשנות אותן.')); return; }
  const apply = async patch => { await context.updateSession(patch); context.rerender(); };
  const flags = context.capabilities?.flags || [];
  body.append(
    section('צבע', 'נקודת צבע ליד שם הסשן ברשימה ובכותרת. לא נשלחת ל-Claude.',
      h('div', { class: 'color-palette', role: 'group', 'aria-label': 'צבע הסשן' }, [
        h('button', { type: 'button', class: `color-choice${session.color ? '' : ' on'}`, onClick: () => apply({ color: '' }) }, 'ללא'),
        ...COLORS.map(color => h('button', { type: 'button', class: `color-choice${session.color === color.key ? ' on' : ''}`, title: color.label, 'aria-pressed': String(session.color === color.key),
          onClick: () => apply({ color: color.key }) }, h('span', { class: 'color-dot', style: `background:${color.hex}` }), color.label))])),
    section('חשיבה', 'כיבוי החשיבה המורחבת (extended thinking) בסשן הזה: Claude עונה בלי לחשוב קודם. נכנס לתוקף בהודעה הבאה. אם המודל שלך לא משתמש בחשיבה מורחבת, אין לכך השפעה.',
      checkbox('כיבוי חשיבה', Boolean(session.thinkingOff), thinkingOff => apply({ thinkingOff }).catch(error => context.toast(error.message, 'error')))),
    promptSection(session, flags, apply, context.toast),
    section('מצב בטוח', 'בסשן הזה תמיד אדם מאשר: אי אפשר לעבור למצב "הכול מותר" או למצב האוטומטי, והם מוסתרים מהתפריטים. זה לא מגביל את Claude בתוך המצבים האחרים, ולא את פקודות ה-! ועורך הקבצים שאתה מפעיל בעצמך.',
      checkbox('מצב בטוח', Boolean(session.safeMode), safeMode => apply({ safeMode }).catch(error => context.toast(error.message, 'error')))));
}
