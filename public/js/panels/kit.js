/** Building blocks shared by all panels: sections, list rows, badges, fields, loading/error states. */
import { h } from '../dom.js';
import { icon } from '../icons.js';

export const section = (title, lead, ...children) =>
  h('section', { class: 'panel-section' }, title ? h('h4', null, title) : null, lead ? h('p', { class: 'lead' }, lead) : null, ...children);

export const badge = (text, tone = '') => h('span', { class: `badge ${tone}` }, text);

export function button(label, onClick, { variant = '', iconName, small = true, title } = {}) {
  return h('button', { type: 'button', class: `btn ${variant} ${small ? 'small' : ''}`, onClick, title },
    iconName ? icon(iconName) : null, label);
}

/** Runs an async action from a button, disabling it meanwhile and reporting errors. */
export function busy(buttonNode, action, onError) {
  return async (...args) => {
    buttonNode.disabled = true;
    try { await action(...args); } catch (error) { onError(error); } finally { buttonNode.disabled = false; }
  };
}

/**
 * @param {{title:Node|string, sub?:Node|string, mono?:boolean, badges?:Node[], actions?:Node[], details?:Node}} options
 */
export function row({ title, sub, mono = false, badges = [], actions = [], details }) {
  return h('div', { class: 'list-row' },
    h('div', { class: 'row-title' }, title, ...badges),
    h('div', { class: 'row-actions' }, ...actions),
    sub ? h('div', { class: `row-sub${mono ? ' mono' : ''}`, dir: mono ? 'ltr' : 'auto' }, sub) : null,
    details || null);
}

export const list = rows => (rows.length ? h('div', { class: 'list' }, ...rows) : empty('אין פריטים להצגה'));
export const empty = text => h('div', { class: 'empty-state' }, text);
export const loading = (text = 'טוען…') => h('div', { class: 'loading' }, icon('loader', 'spinning'), text);
export const errorBox = error => h('div', { class: 'error-box', dir: 'auto' }, error?.message || String(error));

export function field(label, control, { wide = false, hint } = {}) {
  return h('label', { class: `field${wide ? ' wide' : ''}` }, label, control, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function select(options, value) {
  return h('select', null, options.map(option => h('option', { value: option.value, selected: option.value === value }, option.label)));
}

export const kv = rows => h('div', { class: 'kv' }, rows.flatMap(([key, value]) => [h('div', null, key), h('div', { dir: 'auto' }, value ?? '—')]));

/** Older CLIs (e.g. 2.1.246) answer newer control requests with "Unsupported control request subtype". */
export const isUnsupported = error => /Unsupported control request|not supported/i.test(error?.message || '');

/** Fills a container with loading → result of render(data), a neutral note when the CLI lacks it, or an error box. */
export async function load(container, fetcher, render) {
  container.replaceChildren(loading());
  try {
    const data = await fetcher();
    container.replaceChildren(...[].concat(render(data)).filter(Boolean));
  } catch (error) {
    if (isUnsupported(error)) return container.replaceChildren(empty('המידע הזה לא זמין בגרסת Claude Code המותקנת.'));
    console.error('[panels] load failed:', error);
    return container.replaceChildren(errorBox(error));
  }
}

/** Reads the three settings files (user, project, local) as parsed objects; a missing or broken file is {}. */
export async function readAllSettings(context) {
  const sources = [['settings-local', 'localSettings'], ['settings-project', 'projectSettings'], ['settings-user', 'userSettings']];
  return Promise.all(sources.map(async ([kind, source]) => {
    const file = await context.api.readClaudeFile(context.scope, kind).catch(() => null);
    let settings = {};
    try { settings = file?.content?.trim() ? JSON.parse(file.content) : {}; } catch { settings = {}; }
    return { kind, source, settings };
  }));
}

/** Simple tab strip. @returns {HTMLElement} */
export function tabs(items, current, onSelect) {
  return h('div', { class: 'tabs', role: 'tablist' }, items.map(item =>
    h('button', { type: 'button', class: item.id === current ? 'on' : '', onClick: () => onSelect(item.id) }, item.label)));
}

/** Output of a `claude ...` management command as a readable block. */
export function cliOutput(result) {
  const text = [result.stdout, result.stderr, result.error].filter(Boolean).join('\n').trim() || '(ללא פלט)';
  return h('pre', { class: 'output-pre' }, text);
}
