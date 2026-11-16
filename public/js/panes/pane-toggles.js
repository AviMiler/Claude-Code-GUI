/**
 * The topbar's pane buttons and the pane entries of the "עוד" menu. Each shows the pane's state: closed, open in a
 * background tab ("on"), or the shown tab ("active"). A click opens a closed pane, shows a background one, hides the shown one.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';

/** id, icon, the name used inside a sentence, shortcut. Order = the "עוד" menu order. */
const PANES = [
  { id: 'details', icon: 'panel-right', name: 'פרטי הסשן', key: '' },
  { id: 'changes', icon: 'diff', name: 'חלונית השינויים', key: 'Ctrl+Shift+D' },
  { id: 'files', icon: 'folder', name: 'חלונית הקבצים', key: '' },
  { id: 'terminal', icon: 'terminal', name: 'הטרמינל', key: 'Ctrl+`' },
  { id: 'plan', icon: 'map', name: 'חלונית התוכנית', key: '' },
  { id: 'tasks', icon: 'list', name: 'חלונית משימות הרקע', key: '' },
];
const TOPBAR = ['changes', 'files', 'terminal', 'details']; // details last: it sits at the edge the area opens on

/** @param {{paneOpen:(id:string)=>boolean, paneActive:(id:string)=>boolean}} handlers */
function stateOf(handlers, id) {
  if (handlers.paneActive(id)) return 'active';
  return handlers.paneOpen(id) ? 'open' : 'closed';
}

function actionText(pane, state) {
  if (state === 'active') return `הסתרת ${pane.name}`;
  return state === 'open' ? `מעבר אל ${pane.name}` : `הצגת ${pane.name}`;
}

/**
 * @param {{paneOpen:(id:string)=>boolean, paneActive:(id:string)=>boolean, onTogglePane:(id:string)=>void}} handlers
 * @returns {HTMLElement} the group of topbar toggles
 */
export function paneButtons(handlers) {
  return h('div', { class: 'pane-toggles', role: 'group', 'aria-label': 'חלוניות' }, TOPBAR.map(id => {
    const pane = PANES.find(item => item.id === id);
    const state = stateOf(handlers, id);
    const title = `${actionText(pane, state)}${pane.key ? ` (${pane.key})` : ''}`;
    return h('button', { type: 'button', class: `icon-button pane-toggle${state === 'closed' ? '' : ' on'}${state === 'active' ? ' active' : ''}`,
      'aria-pressed': String(state === 'active'), title, 'aria-label': title, dataset: { paneToggle: id }, onClick: () => handlers.onTogglePane(id) },
    icon(pane.icon, id === 'details' ? 'mirror' : ''));
  }));
}

/**
 * @param {{paneOpen:(id:string)=>boolean, paneActive:(id:string)=>boolean, onTogglePane:(id:string)=>void}} handlers
 * @returns {object[]} dropdown entries, under their own section title
 */
export function paneMenuEntries(handlers) {
  return [{ section: 'חלוניות' }, ...PANES.map(pane => {
    const state = stateOf(handlers, pane.id);
    // The shown pane carries a check mark; a background tab says so (the title already says what a click does).
    return { icon: pane.icon, title: actionText(pane, state), checked: state === 'active', hint: state === 'open' ? 'פתוחה ברקע' : pane.key,
      onSelect: () => handlers.onTogglePane(pane.id) };
  })];
}
