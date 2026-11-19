/**
 * The draggable edge of the pane area that faces the chat (mirrored in RTL, where the area is on the left).
 */
import { h } from '../dom.js';

/**
 * @param {{workspace:HTMLElement, area:HTMLElement, minPane:number, minChat:number, onResize:(width:number)=>void,
 *   onDone:(width:number)=>void}} options onResize: during the drag; onDone: once, when the drag ends (to remember it)
 * @returns {HTMLElement} the edge element (the caller places it)
 */
export function createPaneResizer({ workspace, area, minPane, minChat, onResize, onDone }) {
  const resizer = h('div', { class: 'pane-resizer', role: 'separator', 'aria-orientation': 'vertical', title: 'גרירה לשינוי הרוחב' });
  let width = 0;
  resizer.addEventListener('pointerdown', event => {
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    const rtl = getComputedStyle(workspace).direction === 'rtl';
    const move = moveEvent => {
      const box = workspace.getBoundingClientRect();
      const wanted = rtl ? moveEvent.clientX - box.left : box.right - moveEvent.clientX;
      width = Math.round(Math.min(Math.max(minPane, wanted), box.width - minChat));
      area.style.width = `${width}px`;
      onResize(width);
    };
    const stop = () => { resizer.removeEventListener('pointermove', move); if (width) onDone(width); };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', stop, { once: true });
  });
  return resizer;
}
