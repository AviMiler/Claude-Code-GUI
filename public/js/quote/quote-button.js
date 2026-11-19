/** The floating "הוספה לצ'אט" button over a selection: placed above it (below when there is no room), kept inside the window. */
import { h } from '../dom.js';
import { icon } from '../icons.js';

const GAP = 6;
const MARGIN = 8; // the popovers' distance from the window's edges (popover.js)

/**
 * @param {() => void} onAdd the click
 * @returns {{show:(rect:DOMRect, host:HTMLElement)=>void, hide:()=>void, node:HTMLButtonElement}}
 */
export function createQuoteButton(onAdd) {
  const node = h('button', { type: 'button', class: 'quote-button', title: 'הוספת הטקסט המסומן להודעה (בלי לשלוח)',
    onMousedown: event => event.preventDefault(), // the selection and the focus stay where they are
    onClick: () => onAdd() }, icon('message'), "הוספה לצ'אט");

  function show(rect, host) {
    if (node.parentElement !== host) host.append(node); // a modal dialog: the button must be in its top layer to be clickable
    node.hidden = false;
    const { offsetWidth: width, offsetHeight: height } = node;
    const above = rect.top - height - GAP;
    const top = above >= MARGIN ? above : Math.min(rect.bottom + GAP, innerHeight - height - MARGIN);
    // RTL: the button's right edge at the selection's right edge; LTR: left at left; then clamped into the window
    const rtl = document.documentElement.dir === 'rtl';
    const wanted = rtl ? rect.right - width : rect.left;
    const left = Math.max(MARGIN, Math.min(wanted, innerWidth - width - MARGIN));
    Object.assign(node.style, { top: `${Math.max(MARGIN, top)}px`, left: `${left}px` });
  }

  return { node, show, hide: () => { node.hidden = true; } };
}
