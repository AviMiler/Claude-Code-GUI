/** The guided form to add or edit one hook: event, matcher, command, timeout, where to save, and a preview of the JSON. */
import { h } from '../dom.js';
import { button, field, section, busy } from '../panels/kit.js';
import { HOOK_EVENTS, HOOK_SCOPES, eventInfo, hookPreview } from './hook-info.js';

/**
 * @param {object} context Panel context (api, scope, toast).
 * @param {{hook?:object|null, onDone:()=>void, onCancel:()=>void}} options hook: an existing hook (from the list) to edit
 * @returns {HTMLElement}
 */
export function hookForm(context, { hook, onDone, onCancel }) {
  const editing = Boolean(hook);
  const eventSelect = h('select', null, HOOK_EVENTS.map(event => h('option', { value: event.name, selected: event.name === hook?.event }, `${event.name} – ${event.summary}`)));
  const matcherInput = h('input', { type: 'text', dir: 'ltr', list: 'hook-matchers', value: hook?.matcher || '', placeholder: 'ריק = הכול' });
  const matcherList = h('datalist', { id: 'hook-matchers' });
  const commandArea = h('textarea', { class: 'code', spellcheck: false, dir: 'ltr', rows: 4, value: hook?.command || '', placeholder: 'לדוגמה: npm test' });
  const timeoutInput = h('input', { type: 'number', min: 1, max: 3600, step: 1, dir: 'ltr', value: hook?.timeout ?? '', placeholder: 'ברירת מחדל' });
  const scopeSelect = h('select', { disabled: editing }, HOOK_SCOPES.map(scope => h('option', { value: scope.value, selected: scope.value === (hook?.scope || 'local') }, scope.label)));
  const matcherField = h('label', { class: 'field' });
  const hint = h('p', { class: 'lead' });
  const preview = h('pre', { class: 'output-pre', dir: 'ltr' });

  const values = () => ({ scope: scopeSelect.value, event: eventSelect.value, matcher: matcherInput.value.trim(), command: commandArea.value,
    ...(timeoutInput.value ? { timeout: Number(timeoutInput.value) } : {}) });
  const refresh = () => {
    const info = eventInfo(eventSelect.value);
    matcherField.hidden = !info.matchers;
    if (matcherField.hidden) matcherInput.value = '';
    matcherList.replaceChildren(...(info.matchers || []).map(value => h('option', { value })));
    matcherField.replaceChildren(info.matcherLabel || 'matcher', matcherInput, matcherList, h('span', { class: 'hint' }, 'אפשר לבחור מההצעות או לכתוב חופשי, למשל Edit|Write. ריק = כל המקרים.'));
    hint.textContent = info.hint;
    preview.textContent = hookPreview(values());
  };
  const save = async () => {
    const body = values();
    const from = editing && { scope: hook.scope, event: hook.event, groupIndex: hook.groupIndex, hookIndex: hook.hookIndex, command: hook.command, matcher: hook.matcher };
    await (editing ? context.api.updateHook(context.scope.sessionId, { ...body, from }) : context.api.addHook(context.scope.sessionId, body));
    context.toast('ה-hook נשמר. השינוי חל על סשנים חדשים או אחרי הפעלה מחדש של הסשן.');
    onDone();
  };
  const saveButton = button('שמירה', () => {}, { variant: 'primary', small: false, iconName: 'check' });
  // 409: the file changed since the list was read; the message is shown and the list is reloaded
  saveButton.onclick = busy(saveButton, save, error => { context.toast(error.message, 'error'); if (error.status === 409) onDone(); });
  eventSelect.addEventListener('change', refresh);
  [matcherInput, commandArea, timeoutInput, scopeSelect].forEach(control => control.addEventListener('input', () => { preview.textContent = hookPreview(values()); }));
  refresh();
  return section(editing ? 'עריכת hook' : 'הוספת hook', 'פקודת shell ש-Claude Code מריץ באירוע נבחר.',
    h('div', { class: 'form-grid' }, field('אירוע', eventSelect, { wide: true }), matcherField, field('תקרת זמן בשניות (לא חובה)', timeoutInput),
      field('פקודה (חובה)', commandArea, { wide: true }), field('איפה לשמור', scopeSelect, { wide: true })),
    hint, h('p', { class: 'lead' }, 'ה-JSON שייכתב (ימוזג לקובץ הקיים, בלי לגעת בשאר התוכן):'), preview,
    h('div', { class: 'panel-toolbar', style: 'margin-top:8px' }, saveButton, button('ביטול', onCancel, { small: false })));
}
