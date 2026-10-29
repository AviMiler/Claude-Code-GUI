/** The inputs of an MCP elicitation form: one widget per field type, and reading the answer back. Text only, never HTML. */
import { h } from '../dom.js';

const INPUT_TYPES = { email: 'email', uri: 'url', date: 'date', 'date-time': 'datetime-local' };

/** @returns {{node:HTMLElement, read:()=>{value?:any, error?:string}}} read: the value (undefined when left empty) or why it is wrong */
function widgetFor(field) {
  const set = field.default;
  if (field.type === 'boolean') {
    const box = h('input', { type: 'checkbox', checked: set === true });
    return { node: h('label', { class: 'el-check' }, box, 'כן'), read: () => ({ value: box.checked }) };
  }
  if (field.type === 'select') {
    const select = h('select', null, field.required ? null : h('option', { value: '' }, '—'),
      field.options.map(option => h('option', { value: String(option.value), selected: option.value === set }, option.label)));
    return { node: select, read: () => ({ value: field.options.find(option => String(option.value) === select.value)?.value }) };
  }
  if (field.type === 'multiselect') {
    const boxes = field.options.map(option => ({ option, box: h('input', { type: 'checkbox', checked: Array.isArray(set) && set.includes(option.value) }) }));
    return { node: h('div', { class: 'el-multi' }, boxes.map(({ option, box }) => h('label', { class: 'el-check', dir: 'auto' }, box, option.label))),
      read: () => ({ value: boxes.filter(({ box }) => box.checked).map(({ option }) => option.value) }) };
  }
  if (field.type === 'number' || field.type === 'integer') {
    const input = h('input', { type: 'number', dir: 'ltr', step: field.type === 'integer' ? '1' : 'any', min: field.min, max: field.max, value: typeof set === 'number' ? String(set) : '' });
    return { node: input, read: () => (input.value === '' ? {} : { value: Number(input.value) }) };
  }
  if (field.type === 'json') {
    const area = h('textarea', { rows: 3, dir: 'ltr', placeholder: 'JSON' });
    return { node: area, read() {
      if (!area.value.trim()) return {};
      try { return { value: JSON.parse(area.value) }; } catch { return { error: 'JSON לא תקין' }; }
    } };
  }
  const input = h('input', { type: INPUT_TYPES[field.format] || 'text', dir: 'auto', value: typeof set === 'string' ? set : '' });
  return { node: input, read: () => ({ value: input.value }) };
}

/**
 * @param {object[]} fields from the prompt
 * @returns {{node:HTMLElement, read:()=>{content?:object, error?:string}}} read: the answer, or the first thing wrong (a required field left empty, bad JSON)
 */
export function createForm(fields) {
  const widgets = fields.map(field => ({ field, ...widgetFor(field) }));
  const node = h('div', { class: 'el-form' }, widgets.map(({ field, node: widget }) => h('label', { class: 'el-field' },
    h('span', { class: 'el-title', dir: 'auto' }, field.title, field.required ? h('b', { title: 'שדה חובה' }, ' *') : null),
    field.description ? h('span', { class: 'el-desc', dir: 'auto' }, field.description) : null, widget)));
  return {
    node,
    read() {
      const content = {};
      for (const { field, read } of widgets) {
        const { value, error } = read();
        if (error) return { error: `${field.title}: ${error}` };
        const empty = value === undefined || value === '' || (Array.isArray(value) && !value.length);
        if (empty && field.required) return { error: `${field.title}: שדה חובה` };
        if (!empty) content[field.name] = value;
      }
      return { content };
    },
  };
}
