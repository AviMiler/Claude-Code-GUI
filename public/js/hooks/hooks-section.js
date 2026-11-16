/** The hooks list of the hooks panel (scope, event, matcher, command) with add / edit / delete. */
import { h } from '../dom.js';
import { section, list, row, badge, button, empty, errorBox, load } from '../panels/kit.js';
import { hookForm } from './hook-form.js';
import { SCOPE_LABEL } from './hook-info.js';

/**
 * @param {object} context Panel context (api, scope, toast, ask).
 * @returns {HTMLElement} loads its own data; without a session only a note is shown (the folder comes from the session)
 */
export function hooksSection(context) {
  const sessionId = context.scope.sessionId;
  if (!sessionId) return section('Hooks מוגדרים', 'הוספה ועריכה של hooks זמינות בתוך סשן (התיקייה נקבעת לפי הסשן).', empty('פתח סשן כדי לנהל hooks'));
  const box = h('div');
  const show = () => load(box, () => context.api.hooks(sessionId), data => {
    const edit = hook => box.replaceChildren(hookForm(context, { hook, onDone: show, onCancel: show }));
    const remove = async hook => {
      if (!await context.ask({ title: 'למחוק את ה-hook?', text: `${hook.event}${hook.matcher ? ` (${hook.matcher})` : ''}: ${hook.command}`, confirmLabel: 'מחיקה', danger: true })) return;
      await context.api.deleteHook(sessionId, hook).then(() => { context.toast('ה-hook נמחק. השינוי חל על סשנים חדשים או אחרי הפעלה מחדש.'); show(); }, error => context.toast(error.message, 'error'));
    };
    return [
      ...data.files.filter(file => file.error).map(file => errorBox(new Error(file.error))),
      section('Hooks מוגדרים', 'פקודות ש-Claude Code מריץ באירועים. שינוי חל על סשנים חדשים או אחרי הפעלה מחדש של הסשן.',
        data.hooks.length ? list(data.hooks.map(hook => row({
          title: h('span', null, hook.event),
          badges: [badge(SCOPE_LABEL[hook.scope], 'info'), hook.matcher ? badge(hook.matcher) : null, hook.timeout ? badge(`${hook.timeout}s`) : null, hook.type !== 'command' ? badge(hook.type) : null].filter(Boolean),
          sub: hook.command || '(לא פקודת shell)', mono: true,
          actions: [hook.type === 'command' ? button('עריכה', () => edit(hook), { iconName: 'pencil' }) : null, button('מחיקה', () => remove(hook), { variant: 'danger', iconName: 'trash' })].filter(Boolean),
        }))) : empty('אין hooks מוגדרים'),
        h('div', { class: 'panel-toolbar', style: 'margin-top:8px' }, button('הוספת hook', () => edit(null), { variant: 'primary', small: false, iconName: 'plus' }))),
    ];
  });
  show();
  return box;
}
