/**
 * Prompt templates panel: create, edit, duplicate, delete and use saved prompts with {{variables}}. Each template is a
 * CLI custom command (lib/templates/), so it also runs in the terminal as /name.
 */
import { h } from '../dom.js';
import { section, row, list, empty, badge, button, field, load } from './kit.js';
import { templateVariables, useTemplate } from '../templates.js';

/** A command name from the Latin letters and digits of a name ('' when it has none). Same rule as the server's migration. */
const slugOf = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * Editor for one template (new or existing).
 * @param {{id?:string, name?:string, command?:string, text?:string}} draft id: the command it is saved as (none: new)
 * @param {{api:object, toast:Function, onDone:()=>void}} options
 */
function editor(draft, { api, toast, onDone }) {
  const name = h('input', { value: draft.name || '', maxlength: 80, dir: 'auto', placeholder: 'למשל: סקירת קוד' });
  const command = h('input', { value: draft.command ?? draft.id ?? slugOf(draft.name || ''), maxlength: 81, dir: 'ltr', placeholder: 'code-review', spellcheck: false });
  let commandTouched = Boolean(draft.id || draft.command);
  command.addEventListener('input', () => { commandTouched = true; });
  name.addEventListener('input', () => { if (!commandTouched) command.value = slugOf(name.value); });
  const text = h('textarea', { class: 'code markdown-editor', dir: 'auto', placeholder: 'סקור את {{קובץ}} ומצא באגים…' }, draft.text || '');
  const variables = h('div', { class: 'row-sub' });
  const showVariables = () => {
    const names = templateVariables(text.value);
    variables.replaceChildren(names.length ? h('span', null, 'משתנים: ', ...names.map(item => badge(item, 'info'))) : 'אין משתנים. כתוב {{שם}} במקום שיתמלא בכל שימוש.');
  };
  text.addEventListener('input', showVariables);
  showVariables();
  const save = async () => {
    if (!command.value.trim()) { toast('חסר שם פקודה בטרמינל (אותיות לטיניות, ספרות, - ו-_)', 'error'); command.focus(); return; }
    try {
      await api.saveTemplate(command.value.trim(), { description: name.value, text: text.value, create: !draft.id, previous: draft.id });
      toast('התבנית נשמרה');
      onDone();
    } catch (error) {
      toast(error.message, 'error');
    }
  };
  return h('div', { class: 'template-editor' },
    field('שם', name, { wide: true }), field('שם הפקודה בטרמינל (/שם)', command, { wide: true }), field('טקסט', text, { wide: true }), variables,
    h('div', { class: 'panel-toolbar' }, button('שמירה', save, { variant: 'primary', iconName: 'check' }), button('ביטול', onDone)));
}

/**
 * @param {HTMLElement} body
 * @param {{api:object, toast:Function, ask:Function, insert:(text:string, options?:object)=>void, close:()=>void,
 *   composerText:()=>string}} context
 */
export function renderTemplatesPanel(body, context) {
  const { api } = context;
  const editorHolder = h('div');
  const listHolder = h('div');
  const refresh = () => load(listHolder, () => api.templates(), templates => (templates.length ? list(templates.map(templateRow))
    : empty('עדיין אין תבניות. "תבנית חדשה" יוצר אחת, או שמור את מה שכתוב עכשיו בתיבת הכתיבה.')));
  const edit = draft => {
    editorHolder.replaceChildren(editor(draft, { api, toast: context.toast, onDone: () => { editorHolder.replaceChildren(); refresh(); } }));
    editorHolder.querySelector('input').focus();
  };

  function templateRow(template) {
    const names = templateVariables(template.text);
    return row({
      title: h('span', { dir: 'auto' }, template.name),
      badges: [badge(`/${template.id}`), ...(names.length ? [badge(`${names.length} משתנים`, 'info')] : []),
        ...(template.expands ? [badge('מורץ כפקודה', 'warning')] : [])],
      sub: template.text.replace(/\s+/g, ' ').slice(0, 160),
      actions: [
        button('שימוש', () => { context.close(); useTemplate(template, text => context.insert(text, { replace: !context.composerText().trim() })); }, { variant: 'primary', iconName: 'arrow-up' }),
        button('עריכה', () => edit(template), { iconName: 'pencil' }),
        button('שכפול', () => edit({ name: `${template.name} (עותק)`, command: `${template.id}-copy`, text: template.text }), { iconName: 'copy' }),
        button('מחיקה', async () => {
          if (!await context.ask({ title: `למחוק את "${template.name}"?`, confirmLabel: 'מחיקה', danger: true })) return;
          await api.deleteTemplate(template.id).then(refresh).catch(error => context.toast(error.message, 'error'));
        }, { variant: 'danger', iconName: 'trash' }),
      ],
    });
  }

  const current = context.composerText().trim();
  body.append(section('תבניות פרומפטים', 'הודעות שחוזרות על עצמן. {{שם}} בתוך הטקסט הוא משתנה שתתבקש למלא בכל שימוש. '
    + 'התבנית נכנסת לתיבת הכתיבה ולא נשלחת לבד. זמין גם מתפריט ה-+ ליד תיבת הכתיבה. '
    + 'כל תבנית היא פקודה של Claude Code (בתיקיית commands של המשתמש), ולכן עובדת גם בטרמינל: /שם ערך1 ערך2.',
  h('div', { class: 'panel-toolbar' },
    button('תבנית חדשה', () => edit({}), { variant: 'primary', iconName: 'plus' }),
    current ? button('שמירת ההודעה הנוכחית כתבנית', () => edit({ name: current.split('\n')[0].slice(0, 60), text: current }), { iconName: 'file-plus' }) : null),
  editorHolder, listHolder));
  refresh();
}
