/**
 * Floating menus anchored to an element: dropdowns (mode, model, "more") and keyboard-driven lists (/ and @).
 * Entry shapes: { section } | { node } | { icon, title, hint, desc, tag, checked, disabled, onSelect }.
 */
import { h } from './dom.js';
import { icon } from './icons.js';

let openMenu = null;

function position(popover, anchor, placement) {
  const rect = anchor.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  popover.style.insetInlineStart = 'auto';
  if (rtl) popover.style.right = `${Math.max(8, innerWidth - rect.right)}px`;
  else popover.style.left = `${Math.max(8, rect.left)}px`;
  if (placement === 'top') popover.style.bottom = `${innerHeight - rect.top + 6}px`;
  else popover.style.top = `${rect.bottom + 6}px`;
  if (anchor.dataset.matchWidth) {
    popover.style.width = `${rect.width}px`;
    popover.style.maxWidth = `${rect.width}px`;
  }
}

function renderEntry(entry, index, onPick) {
  if (entry.section) return h('div', { class: 'menu-section' }, entry.section);
  if (entry.node) return entry.node;
  return h('button', {
    type: 'button', class: `menu-item${entry.disabled ? ' disabled' : ''}`, dataset: { index: String(index) },
    onMousedown: event => event.preventDefault(), // keep focus in the composer
    onClick: () => onPick(entry),
  },
  icon(entry.icon || 'slash'),
  h('span', { class: 'title' }, entry.titleNode || entry.title),
  entry.checked ? icon('check', 'check') : entry.tag ? h('span', { class: 'tag' }, entry.tag) : h('span', { class: 'hint' }, entry.hint || ''),
  entry.desc ? h('span', { class: 'desc', dir: 'auto' }, entry.desc) : null);
}

export function closeMenus() {
  openMenu?.close();
}

/**
 * Click-to-open dropdown. Closes on outside click, Esc, or after a pick.
 * @param {HTMLElement} anchor
 * @param {object[]} entries
 * @param {{placement?:'top'|'bottom', footer?:Node}} [options]
 */
export function showDropdown(anchor, entries, { placement = 'top', footer } = {}) {
  closeMenus();
  const popover = h('div', { class: 'popover', role: 'menu' });
  const close = () => {
    popover.remove();
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    if (openMenu?.popover === popover) openMenu = null;
  };
  const pick = entry => {
    if (entry.disabled) return;
    close();
    entry.onSelect?.();
  };
  const outside = event => { if (!popover.contains(event.target) && !anchor.contains(event.target)) close(); };
  const onKey = event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
  popover.append(...entries.map((entry, index) => renderEntry(entry, index, pick)), footer || '');
  document.body.append(popover);
  position(popover, anchor, placement);
  document.addEventListener('mousedown', outside, true);
  document.addEventListener('keydown', onKey, true);
  openMenu = { popover, close };
  return openMenu;
}

/**
 * Keyboard-driven list (slash commands, @ mentions). The caller forwards keys via handleKey.
 * @param {HTMLElement} anchor
 * @returns {{update:(entries:object[], footer?:Node)=>void, handleKey:(event:KeyboardEvent)=>boolean, close:()=>void, isOpen:()=>boolean}}
 */
export function createListMenu(anchor) {
  let popover = null;
  let entries = [];
  let active = 0;
  const pickable = () => entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => !entry.section && !entry.node);

  function highlight() {
    popover?.querySelectorAll('.menu-item').forEach(item => item.classList.toggle('active', Number(item.dataset.index) === active));
    popover?.querySelector('.menu-item.active')?.scrollIntoView({ block: 'nearest' });
  }
  const pick = entry => { if (!entry.disabled) entry.onSelect?.(); };

  return {
    isOpen: () => Boolean(popover),
    close() { popover?.remove(); popover = null; },
    update(newEntries, footer) {
      entries = newEntries;
      if (!popover) {
        closeMenus();
        popover = h('div', { class: 'popover', role: 'listbox' });
        document.body.append(popover);
      }
      popover.replaceChildren(...entries.map((entry, index) => renderEntry(entry, index, pick)), footer || '');
      if (!entries.length) popover.append(h('div', { class: 'menu-empty' }, 'אין התאמות'));
      active = pickable()[0]?.index ?? 0;
      anchor.dataset.matchWidth = '1';
      position(popover, anchor, 'top');
      highlight();
    },
    handleKey(event) {
      if (!popover) return false;
      const items = pickable();
      const at = items.findIndex(({ index }) => index === active);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        active = items[(at + step + items.length) % items.length]?.index ?? 0;
        highlight();
        return true;
      }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        if (!items.length) return false;
        pick(entries[active]);
        return true;
      }
      if (event.key === 'Escape') { this.close(); return true; }
      return false;
    },
  };
}
