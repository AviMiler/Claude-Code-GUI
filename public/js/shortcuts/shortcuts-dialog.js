/** The Ctrl+/ dialog "קיצורי מקלדת": every shortcut of shortcut-list.js by group, like Claude Code Desktop's shortcut sheet. */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { SHORTCUTS, SHORTCUT_GROUPS } from './shortcut-list.js';

let openDialog = null;

/** "Ctrl+Shift+\" as key caps; a trailing "+" would be a key of its own. */
const keyCaps = keys => h('span', { class: 'shortcut-keys', dir: 'ltr' }, keys.split(/\+(?!$)/).map(part => h('kbd', null, part)));

const groupSection = group => h('section', { class: 'shortcut-group' }, h('h3', null, group.label),
  SHORTCUTS.filter(item => item.group === group.id).map(item => h('div', { class: 'shortcut-row' }, h('span', { dir: 'auto' }, item.label), keyCaps(item.keys))));

/** Opens the dialog, or closes it when it is open (a second Ctrl+/; the key reaches the page from inside the dialog). */
export function toggleShortcutsDialog() {
  if (openDialog) return openDialog.close();
  const dialog = h('dialog', { class: 'confirm shortcuts-dialog', 'aria-label': 'קיצורי מקלדת' },
    h('div', { class: 'shortcuts-head' }, h('h2', null, 'קיצורי מקלדת'),
      h('button', { type: 'button', class: 'icon-button', title: 'סגירה (Esc)', onClick: () => dialog.close() }, icon('x'))),
    h('div', { class: 'shortcut-groups' }, SHORTCUT_GROUPS.map(groupSection)));
  dialog.addEventListener('close', () => { dialog.remove(); openDialog = null; }); // Esc closes it natively
  dialog.addEventListener('mousedown', event => { // pressing on the backdrop closes it (a selection dragged out does not)
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  document.body.append(dialog);
  dialog.showModal();
  openDialog = dialog;
  return undefined;
}
