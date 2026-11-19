/**
 * "בדיקה אוטומטית" in the session options panel: a command (tests, a build, a linter) that the CLI's Stop hook runs
 * at the end of every turn in which Claude's edit tools changed files; a failure sends Claude back to fix it.
 * Stored per project folder on the server (lib/verify/); saving goes through guardedApi's confirmation (risk.js).
 */
import { h } from '../dom.js';
import { section, button, loading, errorBox } from '../panels/kit.js';
import { isCancelled } from '../risk.js';

const SHELL_LABELS = { cmd: 'cmd', powershell: 'PowerShell', sh: 'sh' };
const LEAD = 'פקודה (למשל npm test) שרצה מעצמה כש-Claude מסיים תור שבו ערך קבצים. אם היא נכשלת, הפלט שלה נשלח ל-Claude והוא ממשיך לתקן באותו תור, עד שהיא עוברת או עד מספר הניסיונות המרבי.';
const NOTES = [
  'רק כלי העריכה של Claude (Edit, Write, MultiEdit, NotebookEdit) מפעילים את הבדיקה. שינויים מפקודות טרמינל (Bash) לא מזוהים.',
  'הבדיקה משותפת לכל הסשנים של אותה תיקיית פרויקט, ורצה בתיקיית הסשן עם מגבלת זמן של 120 שניות.',
  'Claude Code שנפתח מהטרמינל (claude --resume) לא מריץ את הבדיקה: היא קיימת רק בתהליכים שה-GUI מפעיל.',
];

function form(session, context, info, rerender) {
  const check = info.check || { command: '', shell: info.defaultShell, enabled: true };
  const command = h('input', { type: 'text', dir: 'ltr', class: 'verify-command', value: check.command, placeholder: 'npm test', maxLength: 8000, 'aria-label': 'פקודת הבדיקה' });
  const shell = h('select', { 'aria-label': 'shell' }, info.shells.map(name => h('option', { value: name, selected: name === check.shell }, SHELL_LABELS[name] || name)));
  const enabled = h('input', { type: 'checkbox', checked: check.enabled });
  const fail = error => { if (!isCancelled(error)) context.toast(error.message, 'error'); };
  const save = () => context.api.saveVerifyCheck(session.id, { command: command.value, shell: shell.value, enabled: enabled.checked }, info.folder)
    .then(next => { context.toast('הבדיקה האוטומטית נשמרה'); rerender(next); }, fail);
  const clear = () => context.api.clearVerifyCheck(session.id).then(rerender, fail);
  return [
    h('div', { class: 'verify-row' }, command, shell),
    h('label', { class: 'option-check' }, enabled, 'פעיל'),
    h('div', { class: 'panel-toolbar', style: 'margin-top:8px' }, button('שמירה', save, { variant: 'primary' }), info.check ? button('מחיקה', clear, { variant: 'danger' }) : null),
  ];
}

/** @param {object} session @param {{api:object, toast:Function}} context @returns {HTMLElement} */
export function verifySection(session, context) {
  const body = h('div', null, loading());
  const show = info => {
    const notes = h('ul', { class: 'verify-notes detail-muted' }, NOTES.map(text => h('li', null, text)), h('li', null, `ניסיונות מרביים בתור: ${info.maxAttempts}. תיקיית הפרויקט: `, h('bdi', { dir: 'ltr' }, info.folder)));
    body.replaceChildren(...(info.available ? form(session, context, info, show) : [h('p', { class: 'detail-muted' }, info.reason)]), notes);
  };
  context.api.verifyCheck(session.id).then(show, error => body.replaceChildren(errorBox(error)));
  return section('בדיקה אוטומטית', LEAD, body);
}
