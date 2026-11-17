/** A section title of the session list: a button that folds it (remembered), with a menu for a user group (rename, delete, move). */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { openContextMenu } from '../context-menu/menu.js';
import { isCollapsed, setCollapsed } from './prefs.js';
import { renameGroupDialog, deleteGroupDialog, moveGroup, groupList } from './groups-store.js';

function groupMenu(group) {
  const ids = groupList().map(item => item.id);
  const at = ids.indexOf(group.id);
  return [
    { icon: 'pencil', title: 'שינוי שם הקבוצה', onSelect: () => renameGroupDialog(group) },
    at > 0 && { icon: 'chevron-down', title: 'הזזה למעלה', onSelect: () => moveGroup(group.id, -1) },
    at < ids.length - 1 && { icon: 'chevron-down', title: 'הזזה למטה', onSelect: () => moveGroup(group.id, 1) },
    { icon: 'trash', title: 'מחיקת הקבוצה (הסשנים נשארים)', danger: true, onSelect: () => deleteGroupDialog(group) },
  ].filter(Boolean);
}

/**
 * @param {import('./arrange.js').Section} section
 * @param {{onToggle:()=>void, folding:boolean}} options folding: false while searching (every section stays open)
 * @returns {HTMLElement[]} the title row (and nothing else: the rows are added by the caller unless folded)
 */
export function sectionHeader(section, { onToggle, folding }) {
  const folded = folding && isCollapsed(section.id);
  const toggle = h('button', { type: 'button', class: `section-toggle${folded ? ' folded' : ''}`, 'aria-expanded': String(!folded), title: section.tooltip || null,
    onClick: () => { setCollapsed(section.id, !folded); onToggle(); } },
  icon('chevron-down', 'section-chevron'), h('span', { dir: 'auto' }, section.title), h('em', null, String(section.sessions.length)));
  const more = section.group ? h('button', { type: 'button', class: 'row-action section-more', title: `פעולות הקבוצה ${section.group.name}`, 'aria-haspopup': 'menu',
    onClick: event => openContextMenu(event, groupMenu(section.group)) }, icon('more')) : null;
  const row = h('div', { class: 'group-title section-title', dataset: section.group ? { groupId: section.group.id } : {} }, toggle, more);
  if (section.group) row.addEventListener('contextmenu', event => { event.preventDefault(); openContextMenu(event, groupMenu(section.group)); });
  return { row, folded };
}
