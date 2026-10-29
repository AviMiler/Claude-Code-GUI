/** Prompt templates panel: create, edit, duplicate, delete and use saved prompts with {{variables}}. */
import { h } from '../dom.js';
import { section, row, list, empty, badge, button, field, load } from './kit.js';
import { templateVariables, useTemplate } from '../templates.js';

/**
 * Editor for one template (new or existing).
 * @param {{id?:string, name?:string, text?:string}} draft
 * @param {{api:object, toast:Function, onDone:()=>void}} options
 */
function editor(draft, { api, toast, onDone }) {
  const name = h('input', { value: draft.name || '', maxlength: 80, dir: 'auto', placeholder: 'למשל: סקירת קוד' });
  const text = h('textarea', { class: 'code markdown-editor', dir: 'auto', placeholder: 'סקור את {{קובץ}} ומצא באגים…' }, draft.text || '');
  const variables = h('div', { class: 'row-sub' });
  const showVariables = () => {
    const names = templateVariables(text.value);
    variables.replaceChildren(names.length ? h('span', null, 'משתנים: ', ...names.map(item => badge(item, 'info'))) : 'אין משתנים. כתוב {{שם}} במקום שיתמלא בכל שימוש.');
  };
  text.addEventListener('input', showVariables);
  showVariables();
  const save = async () => {
    try {
      await api.saveTemplate(draft.id || crypto.randomUUID(), { name: name.value, text: text.value });
      toast('התבנית נשמרה');
      onDone();
    } catch (error) {
      toast(error.message, 'error');
    }
  };
  return h('div', { class: 'template-editor' },
    field('שם', name, { wide: true }), field('טקסט', text, { wide: true }), variables,
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
      badges: names.length ? [badge(`${names.length} משתנים`, 'info')] : [],
      sub: template.text.replace(/\s+/g, ' ').slice(0, 160),
      actions: [
        button('שימוש', () => { context.close(); useTemplate(template, text => context.insert(text, { replace: !context.composerText().trim() })); }, { variant: 'primary', iconName: 'arrow-up' }),
        button('עריכה', () => edit(template), { iconName: 'pencil' }),
        button('שכפול', () => edit({ name: `${template.name} (עותק)`, text: template.text }), { iconName: 'copy' }),
        button('מחיקה', async () => {
          if (!await context.ask({ title: `למחוק את "${template.name}"?`, confirmLabel: 'מחיקה', danger: true })) return;
          await api.deleteTemplate(template.id).then(refresh).catch(error => context.toast(error.message, 'error'));
        }, { variant: 'danger', iconName: 'trash' }),
      ],
    });
  }

  const current = context.composerText().trim();
  body.append(section('תבניות פרומפטים', 'הודעות שחוזרות על עצמן. {{שם}} בתוך הטקסט הוא משתנה שתתבקש למלא בכל שימוש. '
    + 'התבנית נכנסת לתיבת הכתיבה ולא נשלחת לבד. זמין גם מתפריט ה-+ ליד תיבת הכתיבה.',
  h('div', { class: 'panel-toolbar' },
    button('תבנית חדשה', () => edit({}), { variant: 'primary', iconName: 'plus' }),
    current ? button('שמירת ההודעה הנוכחית כתבנית', () => edit({ name: current.split('\n')[0].slice(0, 60), text: current }), { iconName: 'file-plus' }) : null),
  editorHolder, listHolder));
  refresh();
}
