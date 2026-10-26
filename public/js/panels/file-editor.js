/** Inline editor for one of Claude's own files (skill, agent, command, CLAUDE.md, settings). */
import { h } from '../dom.js';
import { section, button, loading, errorBox } from './kit.js';

/**
 * @param {object} context Panel context (api, scope, toast, ask).
 * @param {{title:string, kind:string, name?:string, template?:string, json?:boolean, onSaved?:()=>void, onClose?:()=>void, allowDelete?:boolean}} options
 * @returns {HTMLElement}
 */
export function fileEditor(context, { title, kind, name, template = '', json = false, onSaved, onClose, allowDelete = false }) {
  const area = h('textarea', { class: `code${json ? '' : ' markdown-editor'}`, spellcheck: false, dir: json ? 'ltr' : 'auto' });
  const status = h('span', { class: 'lead', style: 'margin:0', dir: 'ltr' });
  const box = h('div', null, loading());
  const wrapper = section(title, null, box);

  async function save() {
    if (json) {
      try { JSON.parse(area.value || '{}'); } catch (error) { context.toast(`JSON לא תקין: ${error.message}`, 'error'); return; }
    }
    await context.api.writeClaudeFile(context.scope, kind, name, area.value);
    context.toast('נשמר ✓');
    onSaved?.();
  }

  async function remove() {
    if (!await context.ask({ title: `למחוק את ${name}?`, text: status.textContent, confirmLabel: 'מחיקה', danger: true })) return;
    await context.api.deleteClaudeFile(context.scope, kind, name);
    context.toast('נמחק');
    onSaved?.();
  }

  context.api.readClaudeFile(context.scope, kind, name).then(file => {
    area.value = file.exists ? file.content : template;
    status.textContent = `${file.exists ? '' : '(קובץ חדש) '}${file.path}`;
    const run = action => () => action().catch(error => context.toast(error.message, 'error'));
    box.replaceChildren(status, area, h('div', { class: 'panel-toolbar', style: 'margin-top:8px' },
      button('שמירה', run(save), { variant: 'primary', small: false, iconName: 'check' }),
      onClose ? button('סגירה', onClose, { small: false }) : null,
      allowDelete && file.exists ? button('מחיקה', run(remove), { variant: 'danger', small: false, iconName: 'trash' }) : null));
    area.focus();
  }).catch(error => box.replaceChildren(errorBox(error)));
  return wrapper;
}

/** Front matter + body for a new agent, skill or command file. */
export function markdownFile(meta, body) {
  const lines = Object.entries(meta).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`;
}
