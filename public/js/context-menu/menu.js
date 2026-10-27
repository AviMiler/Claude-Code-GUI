/**
 * A context menu at the mouse (right click) or at the focused element (Shift+F10 / the menu key), built on popover.js's
 * dropdown: arrows, Home/End and Enter drive it, Esc closes it, and focus goes back to where it was.
 */
import { h } from '../dom.js';
import { showDropdown } from '../popover.js';

/** Moves through the menu's enabled items; Enter picks. Returns focus to the trigger when the menu goes. */
function driveByKeys(popover, trigger) {
  const items = () => [...popover.querySelectorAll('.menu-item:not(.disabled)')];
  const onKey = event => {
    if (!popover.isConnected) return done();
    const list = items();
    const at = list.indexOf(document.activeElement);
    const go = index => { event.preventDefault(); list[(index + list.length) % list.length]?.focus(); };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(list.length - 1);
    else if (event.key === 'Escape' || event.key === 'Tab') setTimeout(done); // popover.js closes it
    return undefined;
  };
  const done = () => {
    document.removeEventListener('keydown', onKey, true);
    observer.disconnect();
    if (trigger?.isConnected && !document.querySelector('dialog[open]')) trigger.focus({ preventScroll: true });
  };
  const observer = new MutationObserver(() => { if (!popover.isConnected) done(); }); // closed by a pick or a click outside
  observer.observe(document.body, { childList: true });
  document.addEventListener('keydown', onKey, true);
  items()[0]?.focus({ preventScroll: true });
}

/**
 * @param {MouseEvent|{target:HTMLElement}} event a contextmenu event, or a click on a "⋯" button (opens under it)
 * @param {object[]} entries popover.js entries; `danger: true` marks a destructive item
 */
export function openContextMenu(event, entries) {
  const trigger = event.target.closest('button, [tabindex]') || event.target;
  // A keyboard-opened menu (Shift+F10) has no pointer position: it opens at the focused element.
  const fromPointer = event.type === 'contextmenu' && (event.clientX || event.clientY);
  const box = trigger.getBoundingClientRect();
  const point = fromPointer ? { x: event.clientX, y: event.clientY } : { x: document.documentElement.dir === 'rtl' ? box.right : box.left, y: box.bottom };
  const anchor = h('span', { class: 'context-anchor', style: `left:${point.x}px; top:${point.y - 6}px` });
  document.body.append(anchor);
  const { popover } = showDropdown(anchor, entries, { placement: 'bottom' });
  anchor.remove(); // showDropdown placed the menu already
  entries.forEach((entry, index) => { if (entry.danger) popover.querySelector(`[data-index="${index}"]`)?.classList.add('danger'); });
  const bottom = popover.getBoundingClientRect().bottom;
  if (bottom > innerHeight - 8) popover.style.top = `${Math.max(8, innerHeight - 8 - popover.offsetHeight)}px`; // near the foot of the window
  driveByKeys(popover, trigger);
}

/** Text the user selected: the browser's own menu (copy) stays then. */
export const hasSelection = () => Boolean(String(getSelection?.() || '').trim());
