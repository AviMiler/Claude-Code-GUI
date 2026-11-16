/**
 * The pane area as an overlay drawer when the window has no room for the chat and the docked area side by side: it slides
 * over the chat from the pane side, under the top bar, with a dimmed backdrop. A click on the backdrop, Esc or Ctrl+\ closes
 * it; focus moves into it on open and goes back to the button that opened it on close. Whether it is open is memory only,
 * so a reload on a narrow window never covers the chat. The panes inside are the same DOM as the docked area (state kept).
 */
import { h } from '../dom.js';

const PHONE = 480; // at or below this window width the drawer takes the whole width
const CHAT_PEEK = 56; // otherwise a strip of the chat stays visible beside it

/**
 * @param {{workspace:HTMLElement, area:HTMLElement, onToggle:()=>void}} options onToggle: the drawer opened or closed
 *   (the host redraws and the top bar updates its pressed buttons)
 * @returns {{setNarrow:(narrow:boolean)=>void, narrow:()=>boolean, isOpen:()=>boolean, open:(triggerId:string)=>void,
 *   close:()=>void, width:(wanted:number)=>string, shown:()=>void}}
 */
export function createPaneDrawer({ workspace, area, onToggle }) {
  const chat = workspace.querySelector('.chat');
  const backdrop = h('div', { class: 'pane-backdrop', hidden: true, onClick: () => close() });
  workspace.append(backdrop);
  let narrow = false;
  let isOpen = false;
  let focusPending = false;
  let trigger = null; // { node, id }: where focus goes back to on close

  function apply() {
    const overlay = narrow && isOpen;
    workspace.classList.toggle('pane-narrow', narrow);
    area.classList.toggle('drawer', narrow);
    backdrop.hidden = !overlay;
    if (chat) chat.inert = overlay; // the covered chat keeps its text, but Tab and clicks stay in the drawer
    if (overlay) { area.setAttribute('role', 'dialog'); area.setAttribute('aria-modal', 'true'); }
    else { area.removeAttribute('role'); area.removeAttribute('aria-modal'); }
  }

  /** The window crossed the threshold. Narrowing while working inside the area keeps it on screen as the drawer. */
  function setNarrow(value) {
    if (value === narrow) return;
    const focusInside = !area.hidden && area.contains(document.activeElement);
    narrow = value;
    isOpen = narrow && focusInside;
    if (isOpen) trigger = null;
    apply();
  }

  function open(triggerId) {
    if (!narrow) return;
    const node = document.activeElement;
    trigger = { node: node && node !== document.body && !area.contains(node) ? node : null, id: triggerId };
    isOpen = true;
    focusPending = true;
    apply();
  }

  function restoreFocus() {
    const node = trigger?.node?.isConnected && !trigger.node.closest('[inert]') ? trigger.node : null;
    // The top bar is rebuilt on every change, so the button that opened the drawer is usually a new node by now.
    const toggle = trigger?.id && document.querySelector(`.topbar [data-pane-toggle="${trigger.id}"]`);
    const overflow = document.querySelector('.topbar .pane-toggles.collapsed .pane-overflow');
    const target = node || (toggle?.offsetParent ? toggle : null) || overflow;
    trigger = null;
    target?.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen) return;
    const hadFocus = area.contains(document.activeElement) || document.activeElement === document.body;
    isOpen = false;
    focusPending = false;
    apply();
    onToggle();
    if (hadFocus) restoreFocus();
  }

  // Esc closes the drawer before the page's own Esc (stop the turn) sees it; a pane's input that uses Esc itself
  // (a comment box, the editor) marks the event handled first. Dialogs and menus keep their own Esc.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !narrow || !isOpen || event.defaultPrevented) return;
    if (document.querySelector('.modal-backdrop, .popover, dialog[open]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  });

  return {
    setNarrow,
    narrow: () => narrow,
    isOpen: () => narrow && isOpen,
    open,
    close,
    /** The drawer's width: the docked width while a strip of chat stays visible, the whole width on a phone. */
    width(wanted) {
      if (innerWidth <= PHONE) return '100%';
      return `${Math.max(0, Math.min(wanted, workspace.clientWidth - CHAT_PEEK))}px`;
    },
    /** Called after the host drew the area: a drawer that just opened takes the focus (its shown tab). */
    shown() {
      if (!focusPending || area.hidden) return;
      focusPending = false;
      area.querySelector('.pane-tab.active .pane-tab-main')?.focus({ preventScroll: true });
    },
  };
}
