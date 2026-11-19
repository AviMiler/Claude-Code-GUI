/**
 * Small controls of the schedule form: toggle chips, add/remove row lists, number / date / time inputs, and local
 * date-time helpers. A control that changes without an input event (a chip click, a removed row) dispatches a
 * bubbling 'input' event, so the form only has to listen on its root to refresh the preview.
 */
import { h } from '../dom.js';
import { button } from '../panels/kit.js';

const pad = value => String(value).padStart(2, '0');
/** Tells the form something changed. */
export const notify = node => node.dispatchEvent(new Event('input', { bubbles: true }));

/** @param {number} ms @returns {string} the local date 'YYYY-MM-DD' */
export const localDate = ms => { const date = new Date(ms); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; };
/** @param {number} ms @returns {string} the local time 'HH:MM' */
export const localTime = ms => { const date = new Date(ms); return `${pad(date.getHours())}:${pad(date.getMinutes())}`; };
/** @returns {number} ms of a local date + time (NaN when either is empty) */
export function toMs(date, time) {
  if (!date || !time) return NaN;
  const [y, mo, d] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, hour, minute).getTime();
}

export const timeInput = (value = '09:00') => h('input', { type: 'time', value, dir: 'ltr', class: 'schedule-time' });
export const dateInput = (value = '') => h('input', { type: 'date', value, dir: 'ltr', class: 'schedule-date' });
export const numberInput = (value, min, max) => h('input', { type: 'number', min, max, step: 1, value: value ?? '', dir: 'ltr', class: 'schedule-number' });

/** A labelled group of controls (a `.field` that is not a <label>, so its several controls stay clickable). */
export const group = (label, ...controls) => h('div', { class: 'field schedule-group', role: 'group', 'aria-label': label }, h('span', null, label), h('div', { class: 'schedule-inline' }, ...controls));

/**
 * Toggle chips (aria-pressed buttons).
 * @param {{value:any, label:string, title?:string}[]} items
 * @param {any[]} selected
 * @returns {{node:HTMLElement, value:()=>any[], set:(values:any[])=>void}}
 */
export function chips(items, selected = [], label = '') {
  const buttons = items.map(item => h('button', { type: 'button', class: 'schedule-chip', title: item.title || null, 'aria-pressed': 'false' }, item.label));
  const set = values => buttons.forEach((node, index) => node.setAttribute('aria-pressed', String(values.includes(items[index].value))));
  buttons.forEach(node => node.addEventListener('click', () => {
    node.setAttribute('aria-pressed', String(node.getAttribute('aria-pressed') !== 'true'));
    notify(node);
  }));
  set(selected);
  return {
    node: h('div', { class: 'schedule-chips', role: 'group', 'aria-label': label || null }, buttons),
    value: () => items.filter((_, index) => buttons[index].getAttribute('aria-pressed') === 'true').map(item => item.value),
    set,
  };
}

/**
 * Rows that can be added and removed.
 * @param {{make:(value?:any)=>{node:HTMLElement, value:()=>any}, addLabel:string, max:number, min?:number}} options
 * @returns {{node:HTMLElement, value:()=>any[], set:(values:any[])=>void}}
 */
export function rowList({ make, addLabel, max, min = 0 }) {
  const holder = h('div', { class: 'schedule-rows' });
  let rows = [];
  const refresh = () => {
    holder.replaceChildren(...rows.map(row => row.wrap));
    add.disabled = rows.length >= max;
    rows.forEach(row => { row.remove.disabled = rows.length <= min; });
  };
  function append(value) {
    const row = make(value);
    const remove = button('', () => { rows = rows.filter(item => item !== entry); refresh(); notify(holder); }, { iconName: 'x', title: 'הסרה' });
    remove.setAttribute('aria-label', 'הסרה');
    const entry = { ...row, remove, wrap: h('div', { class: 'schedule-row' }, row.node, remove) };
    rows.push(entry);
  }
  const add = button(addLabel, () => { append(); refresh(); notify(holder); rows.at(-1)?.wrap.querySelector('input')?.focus(); }, { iconName: 'plus' });
  const set = values => { rows = []; values.forEach(append); refresh(); };
  return { node: h('div', { class: 'schedule-rowlist' }, holder, add), value: () => rows.map(row => row.value()), set };
}

/**
 * A list of dates added one by one (excluded dates).
 * @returns {{node:HTMLElement, value:()=>string[], set:(dates:string[])=>void}}
 */
export function dateList(max) {
  const input = dateInput();
  const shown = h('div', { class: 'schedule-chips' });
  let dates = [];
  const label = text => text.split('-').reverse().join('.');
  const draw = () => shown.replaceChildren(...dates.map(text => h('span', { class: 'schedule-chip static', dir: 'ltr' }, label(text),
    h('button', { type: 'button', class: 'schedule-chip-x', 'aria-label': `הסרת ${label(text)}`, onClick: () => { dates = dates.filter(item => item !== text); draw(); notify(shown); } }, '×'))));
  const add = button('הוספה', () => {
    if (!input.value || dates.includes(input.value) || dates.length >= max) return;
    dates = [...dates, input.value].sort();
    input.value = '';
    draw();
    notify(shown);
  }, { iconName: 'plus' });
  const set = values => { dates = [...values]; draw(); };
  return { node: h('div', { class: 'schedule-datelist' }, h('div', { class: 'schedule-inline' }, input, add), shown), value: () => dates, set };
}
