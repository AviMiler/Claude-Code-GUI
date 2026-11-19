/** Page-wide shortcut actions that act on the composer's chips and the sidebar's session list. */
import { state } from '../state.js';
import { showDropdown, closeMenus } from '../popover.js';
import { EFFORT_LEVELS } from '../modes.js';

let pane; // the focused pane (split-focused.js)
const chips = () => pane.area().querySelectorAll('.composer-chip'); // [permission mode, model] of the focused pane's composer

/** Opens a chip's menu; pressing again while a menu is open closes it. */
function openChip(index) {
  const chip = chips()[index];
  if (document.querySelector('.popover')) return closeMenus();
  if (chip && !chip.disabled) chip.click();
}

/** The effort levels as their own menu under the model chip. */
function openEffort() {
  const anchor = chips()[1];
  if (document.querySelector('.popover')) return closeMenus();
  if (!anchor) return;
  const current = (pane.session() || state.draft).effort || '';
  showDropdown(anchor, [{ section: 'מאמץ (effort)' }, ...EFFORT_LEVELS.map(level => ({
    icon: 'sliders', title: level.label, checked: level.value === current, onSelect: () => pane.actions().trySettings({ effort: level.value }),
  }))]);
}

/** Selects the next (+1) or previous (-1) session row of the sidebar, in the order it shows them. The click goes to the focused
 *  pane (app.js); the focused session's row has aria-current, and the other pane's session (`also-open`) is skipped. */
function stepSession(step) {
  const rows = [...document.querySelectorAll('#session-list .session-row:not(.light):not(.also-open)')];
  if (!rows.length) return;
  const at = rows.findIndex(row => row.getAttribute('aria-current') === 'true');
  rows[at < 0 ? (step > 0 ? 0 : rows.length - 1) : (at + step + rows.length) % rows.length].click();
}

/**
 * @param {{pane:import('../split-focused.js').createFocusedPane, side:(sessionId:string)=>void}} deps the focused pane (its actions and session); side opens the side question tab of a session
 * @returns {{modeMenu, modelMenu, effortMenu, nextSession, prevSession, sideQuestion}} actions named in shortcut-list.js
 */
export function extraShortcuts({ pane: focused, side }) {
  pane = focused;
  return {
    modeMenu: () => openChip(0), modelMenu: () => openChip(1), effortMenu: () => openEffort(),
    nextSession: () => stepSession(1), prevSession: () => stepSession(-1),
    sideQuestion: () => { const session = pane.session(); if (session) side(session.id); },
  };
}
