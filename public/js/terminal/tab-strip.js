/** The Terminal pane's tab strip ("טרמינל 1", ...) and the folder line under it. */
import { h, folderName } from '../dom.js';
import { icon } from '../icons.js';

/**
 * @param {{list:import('./terminal-tabs.js').TerminalTab[], active:string|null, max:number}} view
 * @param {{onSelect:(id:string)=>void, onClose:(id:string)=>void, onAdd:()=>void}} handlers
 * @returns {HTMLElement}
 */
export function tabStrip({ list, active, max }, { onSelect, onClose, onAdd }) {
  const tabs = list.map(tab => h('div', { class: `shell-tab${tab.id === active ? ' active' : ''}`, role: 'tab', 'aria-selected': String(tab.id === active) },
    h('button', { type: 'button', class: 'shell-tab-main', title: tab.cwd, onClick: () => onSelect(tab.id) },
      tab.running ? icon('loader', 'shell-tab-busy') : null, h('span', { class: 'shell-tab-title' }, `טרמינל ${tab.n}`), h('span', { class: 'shell-tab-folder', dir: 'ltr' }, folderName(tab.cwd))),
    h('button', { type: 'button', class: 'shell-tab-close', title: 'סגירת הטרמינל (עוצר את הפקודה שרצה בו)', 'aria-label': `סגירת טרמינל ${tab.n}`, onClick: () => onClose(tab.id) }, icon('x'))));
  const add = h('button', { type: 'button', class: 'btn small shell-tab-add', title: 'טרמינל חדש', 'aria-label': 'טרמינל חדש', disabled: list.length >= max, onClick: onAdd }, icon('plus'));
  const current = list.find(tab => tab.id === active);
  return h('div', { class: 'shell-tabs' }, h('div', { class: 'shell-tab-list', role: 'tablist' }, ...tabs, add),
    current ? h('div', { class: 'shell-cwd', dir: 'ltr', title: 'התיקייה הנוכחית של הטרמינל' }, icon('folder'), h('span', {}, current.cwd)) : null);
}
