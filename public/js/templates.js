/**
 * Using prompt templates in the composer: the "+" menu's searchable list, `{{variable}}` parsing, and the form that
 * fills the variables. The filled text is inserted into the composer, never sent by itself.
 */
import { api } from './api.js';
import { h } from './dom.js';
import { showDropdown } from './popover.js';
import { toast } from './ui.js';

// {{name}}: letters (any script), digits, spaces, _ and -; "{{ שם הקובץ }}" works too.
const VARIABLE_PATTERN = /\{\{\s*([\p{L}\p{N}_\- ]{1,40}?)\s*\}\}/gu;

/** Variable names in order of first appearance. @param {string} text @returns {string[]} */
export function templateVariables(text) {
  return [...new Set([...String(text).matchAll(VARIABLE_PATTERN)].map(match => match[1].trim()))];
}

/** Replaces every {{name}} with its value. @param {string} text @param {Record<string,string>} values @returns {string} */
export function fillTemplate(text, values) {
  return String(text).replace(VARIABLE_PATTERN, (whole, name) => values[name.trim()] ?? whole);
}

/** Asks for the value of each variable. @returns {Promise<Record<string,string>|null>} null when cancelled */
function askVariables(template, names) {
  return new Promise(resolve => {
    const inputs = names.map(name => h('textarea', { rows: 1, dir: 'auto', 'aria-label': name, placeholder: name }));
    const dialog = h('dialog', { class: 'confirm template-fill' });
    const finish = result => { dialog.close(); dialog.remove(); resolve(result); };
    const ok = () => finish(Object.fromEntries(names.map((name, index) => [name, inputs[index].value])));
    dialog.append(h('h2', { dir: 'auto' }, template.name), h('p', null, 'מלא את הערכים. הטקסט ייכנס לתיבת הכתיבה, ואפשר לערוך אותו לפני השליחה.'),
      ...names.map((name, index) => h('label', { class: 'field' }, name, inputs[index])),
      h('div', { class: 'card-actions' },
        h('button', { type: 'button', class: 'btn ghost', onClick: () => finish(null) }, 'ביטול'),
        h('button', { type: 'button', class: 'btn primary', onClick: ok }, 'הכנסה לתיבה')));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    // Enter moves on / confirms; Shift+Enter makes a new line inside a value.
    inputs.forEach((input, index) => input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      if (index < inputs.length - 1) inputs[index + 1].focus(); else ok();
    }));
    document.body.append(dialog);
    dialog.showModal();
    inputs[0]?.focus();
  });
}

/**
 * Fills a template's variables (if any) and inserts the result into the composer. A command whose text the CLI must
 * expand itself (!`command`, a line starting with @) goes in as `/name `: the CLI runs it on send.
 * @param {{id:string, name:string, text:string, expands?:boolean}} template
 * @param {(text:string)=>void} insert puts text into the composer
 */
export async function useTemplate(template, insert) {
  if (template.expands) return insert(`/${template.id} `);
  const names = templateVariables(template.text);
  const values = names.length ? await askVariables(template, names) : {};
  if (values) insert(fillTemplate(template.text, values));
}

/**
 * The "+" menu's template list: search box on top, one entry per template, and a link to the panel.
 * @param {HTMLElement} anchor
 * @param {{insert:(text:string)=>void, openPanel:()=>void}} handlers
 */
export async function showTemplateMenu(anchor, { insert, openPanel }) {
  let templates;
  try {
    templates = await api.templates();
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  const search = h('input', { type: 'search', class: 'menu-search', placeholder: 'חיפוש תבנית…', dir: 'auto', 'aria-label': 'חיפוש תבנית' });
  const entries = templates.map(template => ({
    icon: 'file', title: template.name, desc: template.text.replace(/\s+/g, ' ').slice(0, 90),
    tag: template.expands ? `/${template.id}` : templateVariables(template.text).length ? '{{…}}' : '', onSelect: () => useTemplate(template, insert),
  }));
  const menu = showDropdown(anchor, [
    { section: 'תבניות פרומפטים' },
    ...(templates.length ? [{ node: search }, ...entries] : [{ icon: 'info', title: 'עדיין אין תבניות', desc: 'יוצרים תבנית בחלון התבניות', disabled: true }]),
    { icon: 'pencil', title: 'ניהול תבניות…', onSelect: openPanel },
  ]);
  const items = [...menu.popover.querySelectorAll('.menu-item')].slice(0, entries.length);
  search.addEventListener('input', () => {
    const needle = search.value.trim().toLowerCase();
    items.forEach((item, index) => {
      item.hidden = Boolean(needle) && !`${templates[index].name} ${templates[index].text}`.toLowerCase().includes(needle);
    });
  });
  search.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    items.find(item => !item.hidden)?.click();
  });
  search.focus();
}
