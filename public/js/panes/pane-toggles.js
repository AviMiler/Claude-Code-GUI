/**
 * The top bar's pane buttons: one icon button per pane, pressed (aria-pressed) while the pane is on screen, its tooltip
 * naming the shortcut. Plan and Background tasks appear only when the session has something there (pane-attention.js).
 * When the top bar has no room the buttons collapse into one "חלוניות" button with a menu (pane-overflow.js measures).
 * A click opens a closed pane, shows a background one, hides the shown one.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { openContextMenu } from '../context-menu/menu.js';
import { hasContent, noteContent, hasDot, clearDot } from './pane-attention.js';

/** id, icon, the name used inside a sentence, shortcut. Order = the top bar order (details last, at the edge the area opens on). */
const PANES = [
  { id: 'plan', icon: 'map', name: 'חלונית התוכנית', key: '' },
  { id: 'tasks', icon: 'list', name: 'חלונית משימות הרקע', key: '' },
  { id: 'changes', icon: 'diff', name: 'חלונית השינויים', key: 'Ctrl+Shift+D' },
  { id: 'files', icon: 'folder', name: 'חלונית הקבצים', key: '' },
  { id: 'preview', icon: 'globe', name: 'התצוגה המקדימה', key: '' },
  { id: 'terminal', icon: 'terminal', name: 'הטרמינל', key: 'Ctrl+`' },
  { id: 'details', icon: 'panel-right', name: 'פרטי הסשן', key: '' },
];

/** @param {{paneOpen:(id:string)=>boolean, paneActive:(id:string)=>boolean}} handlers */
function stateOf(handlers, id) {
  if (handlers.paneActive(id)) return 'active';
  return handlers.paneOpen(id) ? 'open' : 'closed';
}

function actionText(pane, state) {
  if (state === 'active') return `הסתרת ${pane.name}`;
  return state === 'open' ? `מעבר אל ${pane.name}` : `הצגת ${pane.name}`;
}

/** The panes the session offers now: an open tab stays offered when its content is gone (it shows its empty state). */
function offered(handlers, session) {
  noteContent(session);
  return PANES.filter(pane => handlers.paneOpen(pane.id) || hasContent(pane.id, session)).map(pane => {
    const state = stateOf(handlers, pane.id);
    if (state === 'active') clearDot(session.id, pane.id);
    return { pane, state, dot: hasDot(session.id, pane.id) };
  });
}

const dotNode = () => h('span', { class: 'pane-dot', 'aria-hidden': 'true' });

/** @returns {object[]} popover.js entries of the offered panes (the overflow menu) */
function menuEntries(list, handlers) {
  // The shown pane carries a check mark; a background tab says so; a new one says "חדש".
  return list.map(({ pane, state, dot }) => ({ icon: pane.icon, title: actionText(pane, state), checked: state === 'active',
    tag: dot && state !== 'active' ? 'חדש' : '', hint: state === 'open' ? 'פתוחה ברקע' : pane.key, onSelect: () => handlers.onTogglePane(pane.id) }));
}

/**
 * @param {{paneOpen:(id:string)=>boolean, paneActive:(id:string)=>boolean, onTogglePane:(id:string)=>void}} handlers
 * @param {object} session the main session
 * @returns {HTMLElement} the group of top bar toggles plus its overflow button
 */
export function paneButtons(handlers, session) {
  const list = offered(handlers, session);
  const buttons = list.map(({ pane, state, dot }) => {
    const title = `${actionText(pane, state)}${pane.key ? ` (${pane.key})` : ''}${dot ? ' · חדש' : ''}`;
    return h('button', { type: 'button', class: `icon-button pane-toggle${state === 'closed' ? '' : ' on'}${state === 'active' ? ' active' : ''}`,
      'aria-pressed': String(state === 'active'), title, 'aria-label': title, dataset: { paneToggle: pane.id }, onClick: () => handlers.onTogglePane(pane.id) },
    icon(pane.icon, pane.id === 'details' ? 'mirror' : ''), dot ? dotNode() : null);
  });
  const anyShown = list.some(item => item.state === 'active');
  const anyDot = list.some(item => item.dot);
  const overflow = h('button', { type: 'button', class: `icon-button pane-overflow${anyShown ? ' on' : ''}`, title: 'חלוניות', 'aria-label': 'חלוניות',
    'aria-haspopup': 'menu', onClick: event => openContextMenu(event, menuEntries(offered(handlers, session), handlers)) },
  icon('panel-right', 'mirror'), anyDot ? dotNode() : null);
  return h('div', { class: 'pane-toggles', role: 'group', 'aria-label': 'חלוניות' }, ...buttons, overflow);
}
