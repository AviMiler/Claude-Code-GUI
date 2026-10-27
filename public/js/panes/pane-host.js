/**
 * The pane area beside the chat (like Claude Code Desktop): panes registered here open stacked in one resizable
 * column; which panes are open and the column's width are remembered per browser. Panes belong to the main session.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';

const OPEN_KEY = 'claude-gui.panes-open';
const WIDTH_KEY = 'claude-gui.panes-width';
const DEFAULT_OPEN = ['details']; // Desktop shows the session details rail by default
const MIN_CHAT = 560;
const MIN_PANE = 280;
const DEFAULT_WIDTH = 340;

function recall(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; }
}
function remember(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be blocked */ }
}

/**
 * @typedef {object} PaneDefinition
 * @property {string} id
 * @property {string} title
 * @property {string} icon
 * @property {(body:HTMLElement, session:object)=>void} render  draws the pane for the session; called on every refresh,
 *   so it must be cheap and keep its own state (open sections, cached fetches)
 */

/**
 * @param {{workspace:HTMLElement, area:HTMLElement}} elements workspace: the row holding the chat and the area
 * @returns {{register:(pane:PaneDefinition)=>void, toggle:(id:string)=>void, isOpen:(id:string)=>boolean,
 *   closeFocused:()=>void, refresh:(session:object|null)=>void}}
 */
export function createPaneHost({ workspace, area }) {
  const definitions = new Map();
  const sections = new Map(); // id -> { section, body }
  let open = recall(OPEN_KEY, DEFAULT_OPEN).filter(id => typeof id === 'string');
  let width = Number(recall(WIDTH_KEY, DEFAULT_WIDTH)) || DEFAULT_WIDTH;
  let focusedId = null;
  let lastSession = null;
  const stack = h('div', { class: 'pane-stack' });
  const resizer = h('div', { class: 'pane-resizer', role: 'separator', 'aria-orientation': 'vertical', title: 'גרירה לשינוי הרוחב' });
  area.append(resizer, stack);

  const hasRoom = () => workspace.clientWidth >= MIN_CHAT + Math.max(MIN_PANE, width);

  function sectionFor(id) {
    if (sections.has(id)) return sections.get(id);
    const definition = definitions.get(id);
    const body = h('div', { class: 'pane-body' });
    const section = h('section', { class: 'pane', dataset: { pane: id }, 'aria-label': definition.title },
      h('header', { class: 'pane-head' }, icon(definition.icon), h('span', { class: 'pane-title' }, definition.title),
        h('button', { type: 'button', class: 'icon-button', title: 'סגירה', onClick: () => toggle(id) }, icon('x'))),
      body);
    section.addEventListener('pointerdown', () => { focusedId = id; });
    section.addEventListener('focusin', () => { focusedId = id; });
    sections.set(id, { section, body });
    return sections.get(id);
  }

  function refresh(session = lastSession) {
    lastSession = session;
    const visible = open.filter(id => definitions.has(id));
    area.hidden = !session || !visible.length || !hasRoom();
    if (area.hidden) return;
    area.style.width = `${Math.max(MIN_PANE, width)}px`;
    // Re-attach only when the set changed: moving a pane's node would drop the focus of an input inside it.
    const shown = [...stack.children].map(child => child.dataset.pane).join();
    if (shown !== visible.join()) stack.replaceChildren(...visible.map(id => sectionFor(id).section));
    for (const id of visible) definitions.get(id).render(sectionFor(id).body, session);
  }

  function toggle(id) {
    // Without room the area is hidden anyway; changing the saved choice then would silently lose it.
    if (!hasRoom()) return toast('אין מקום לחלונית ליד השיחה. הרחב את החלון, הסתר את סרגל הצד או סגור את הפיצול.');
    const opening = !open.includes(id);
    open = opening ? [...open, id] : open.filter(item => item !== id);
    remember(OPEN_KEY, open);
    if (!opening && focusedId === id) focusedId = null;
    return refresh();
  }

  // Dragging the edge that faces the chat resizes the column (mirrored in RTL, where the area is on the left).
  resizer.addEventListener('pointerdown', event => {
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    const rtl = getComputedStyle(workspace).direction === 'rtl';
    const move = moveEvent => {
      const box = workspace.getBoundingClientRect();
      const wanted = rtl ? moveEvent.clientX - box.left : box.right - moveEvent.clientX;
      width = Math.round(Math.min(Math.max(MIN_PANE, wanted), box.width - MIN_CHAT));
      area.style.width = `${width}px`;
    };
    const stop = () => { resizer.removeEventListener('pointermove', move); remember(WIDTH_KEY, width); };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', stop, { once: true });
  });
  new ResizeObserver(() => refresh()).observe(workspace);

  return {
    register(pane) { definitions.set(pane.id, pane); },
    toggle,
    isOpen: id => open.includes(id), // the user's choice (the area may still be hidden for lack of room)
    /** Closes the pane the user clicked or focused last (Desktop: Ctrl+\). */
    closeFocused() { if (focusedId && open.includes(focusedId)) toggle(focusedId); },
    refresh,
  };
}
