/**
 * The "הגבלת כלים" section of the session-options panel: which built-in tools the session starts Claude Code with, a lean
 * preset, and which MCP servers are on. It shortens the prompt for a small model; it is NOT a security feature.
 */
import { h } from '../dom.js';
import { section, button } from '../panels/kit.js';
import { availableTools, mcpServerNames, LEAN_PROFILE } from './tool-catalog.js';

const LEAD = 'פחות כלים = הנחיה קצרה יותר ופחות קריאות שגויות במודל קטן. זה לא כלי אבטחה: הוא לא מונע דבר שהמשתמש לא היה מאשר ממילא (לשם כך יש "מצב בטוח" והרשאות). נכנס לתוקף בהודעה הבאה (Claude Code מופעל מחדש עם השיחה הקיימת).';

const check = (label, checked, onChange, extra = {}) => {
  const box = h('input', { type: 'checkbox', checked, ...extra });
  if (onChange) box.addEventListener('change', () => onChange(box.checked));
  return h('label', { class: 'option-check', dir: 'ltr', style: 'justify-content:flex-end' }, label, box);
};

function mcpBlock(session, info, save) {
  const names = mcpServerNames(session, info);
  if (!names.length) return h('p', { class: 'detail-muted' }, 'שרתי MCP יופיעו כאן אחרי ההודעה הראשונה בסשן.');
  const off = new Set(session.mcpOff || []);
  const switches = names.map(name => check(name, !off.has(name), on => { on ? off.delete(name) : off.add(name); save({ mcpOff: [...off] }); }));
  return h('div', null, h('h4', null, 'שרתי MCP בסשן הזה'), h('div', { class: 'option-group' }, switches),
    h('p', { class: 'detail-muted' }, 'כיבוי נשלח ל-Claude Code אחרי שהוא עולה. אם הגרסה המותקנת לא תומכת בכך, השרת יישאר פעיל.'));
}

/** @param {{session:object, capabilities?:{flags:string[]}, runtimeInfo:(id:string)=>object|null, updateSession:(patch:object)=>Promise, rerender:()=>void, toast:Function}} context */
export function toolLimitsSection(context) {
  const { session } = context;
  const flags = context.capabilities?.flags || [];
  const save = patch => context.updateSession(patch).then(() => context.rerender()).catch(error => context.toast(error.message, 'error'));
  const info = context.runtimeInfo?.(session.id) || null;
  if (!flags.includes('--tools') && !flags.includes('--disallowedTools')) {
    return section('הגבלת כלים', LEAD, h('p', { class: 'detail-muted' }, 'הגרסה המותקנת של Claude Code לא תומכת בכך (אין --tools ולא --disallowedTools).'), mcpBlock(session, info, save));
  }
  const { names, reported } = availableTools(session, info);
  const kept = new Set(session.toolsOnly?.length ? session.toolsOnly : names);
  const boxes = names.map(name => check(name, kept.has(name), null, { value: name }));
  const group = h('div', { class: 'option-group', style: 'columns:2;column-gap:12px' }, boxes);
  const chosen = () => boxes.map(label => label.querySelector('input')).filter(box => box.checked).map(box => box.value);
  const apply = list => save({ toolsOnly: list.length === names.length ? [] : list });
  return section('הגבלת כלים', LEAD,
    reported ? null : h('p', { class: 'detail-muted' }, 'רשימת הכלים של Claude Code עוד לא התקבלה: מוצגת רשימה קבועה של הכלים המובנים.'),
    group,
    h('div', { class: 'panel-toolbar', style: 'margin-top:8px' },
      button('שמירה', () => apply(chosen()), { variant: 'primary' }),
      button('פרופיל רזה', () => apply(LEAN_PROFILE)),
      session.toolsOnly?.length ? button('ללא הגבלה', () => save({ toolsOnly: [] })) : null),
    mcpBlock(session, info, save));
}
