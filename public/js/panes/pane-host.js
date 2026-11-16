/**
 * The pane area beside the chat (like Claude Code Desktop): ONE resizable area with a tab strip; each open pane is a tab
 * and one pane is shown at a time. Opening a pane from anywhere adds or activates its tab; closing the last tab hides the
 * area. Inactive panes stay in the DOM (hidden), so a terminal's output, an editor's unsaved text or a half-typed comment
 * survive a tab switch. Which panes are open, the active one and the width are remembered per browser. Main session only.
 */
import { h } from '../dom.js';
import { toast } from '../ui.js';
import { createPaneTabs } from './pane-tabs.js';
import { createPaneResizer } from './pane-resize.js';

const OPEN_KEY = 'claude-gui.panes-open';
const ACTIVE_KEY = 'claude-gui.panes-active';
const WIDTH_KEY = 'claude-gui.panes-width';
const FIRST = 'details'; // Desktop shows the session details rail by default; its tab always comes first
const MIN_CHAT = 560;
const MIN_PANE = 280;
const DEFAULT_WIDTH = 340;
const NO_ROOM = 'אין מקום לחלונית ליד השיחה. הרחב את החלון, הסתר את סרגל הצד או סגור את הפיצול.';

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
 * @property {(body:HTMLElement, session:object)=>void} render  draws the pane for the session; called on every refresh
 *   while it is the active tab, so it must be cheap and keep its own state (open sections, cached fetches)
 */

/**
 * @param {{workspace:HTMLElement, area:HTMLElement, onChange:()=>void}} elements workspace: the row holding the chat and the
 *   area; onChange: a pane opened, closed or became active (the topbar shows which ones are open)
 * @returns {{register:(pane:PaneDefinition)=>void, toggle:(id:string)=>void, open:(id:string)=>void, isOpen:(id:string)=>boolean,
 *   isActive:(id:string)=>boolean, closeFocused:()=>void, refresh:(session:object|null)=>void}}
 */
export function createPaneHost({ workspace, area, onChange }) {
  const definitions = new Map();
  const sections = new Map(); // id -> { section, body }
  let open = recall(OPEN_KEY, [FIRST]);
  open = Array.isArray(open) ? open.filter(id => typeof id === 'string') : [FIRST];
  if (open.includes(FIRST)) open = [FIRST, ...open.filter(id => id !== FIRST)]; // a saved order from before may hold it later
  let active = String(recall(ACTIVE_KEY, '') || '');
  let width = Number(recall(WIDTH_KEY, DEFAULT_WIDTH)) || DEFAULT_WIDTH;
  let lastSession = null;
  const strip = h('div', { class: 'pane-tabs' });
  const views = h('div', { class: 'pane-views' });
  const tabs = createPaneTabs({ strip, onSelect: id => activate(id), onClose: id => close(id) });
  const resizer = createPaneResizer({ workspace, area, minPane: MIN_PANE, minChat: MIN_CHAT,
    onResize: value => { width = value; }, onDone: value => remember(WIDTH_KEY, value) });
  area.append(resizer, h('div', { class: 'pane-frame' }, strip, views));

  const hasRoom = () => workspace.clientWidth >= MIN_CHAT + Math.max(MIN_PANE, width);
  const visible = () => open.filter(id => definitions.has(id));
  const shownActive = () => (visible().includes(active) ? active : visible()[0] || '');

  function sectionFor(id) {
    if (sections.has(id)) return sections.get(id);
    const definition = definitions.get(id);
    const body = h('div', { class: 'pane-body' });
    const section = h('section', { class: 'pane', id: `pane-${id}`, role: 'tabpanel', dataset: { pane: id },
      'aria-labelledby': `pane-tab-${id}`, hidden: true }, body);
    views.append(section); // attached once and never moved: moving would drop the focus of an input inside it
    sections.set(id, { section, body });
    return sections.get(id);
  }

  function refresh(session = lastSession) {
    lastSession = session;
    const ids = visible();
    area.hidden = !session || !ids.length || !hasRoom();
    if (area.hidden) return;
    area.style.width = `${Math.max(MIN_PANE, width)}px`;
    const current = shownActive();
    tabs.update(ids.map(id => definitions.get(id)), current);
    for (const [id, { section }] of sections) section.hidden = id !== current;
    const { section, body } = sectionFor(current);
    section.hidden = false;
    definitions.get(current).render(body, session); // inactive panes keep their last drawing until shown again
  }

  function save() { remember(OPEN_KEY, open); remember(ACTIVE_KEY, active); }
  function changed() { save(); refresh(); onChange(); }

  /** Adds the pane's tab (the details tab first, the rest in opening order) and shows it. */
  function activate(id) {
    if (!open.includes(id)) open = id === FIRST ? [id, ...open] : [...open, id];
    active = id;
    changed();
  }

  /** Closes a tab; the tab beside it becomes active. Focus inside the area moves to the new active tab. */
  function close(id) {
    const ids = visible();
    const index = ids.indexOf(id);
    const hadFocus = area.contains(document.activeElement);
    open = open.filter(item => item !== id);
    if (active === id || !visible().includes(active)) {
      const rest = ids.filter(item => item !== id);
      active = rest[Math.min(Math.max(index, 0), rest.length - 1)] || '';
    }
    changed();
    if (hadFocus) strip.querySelector('.pane-tab.active .pane-tab-main')?.focus();
  }

  /** A topbar / menu / shortcut toggle: opens a closed pane, shows an open but hidden one, closes the shown one. */
  function toggle(id) {
    // Without room the area is hidden anyway; changing the saved choice then would silently lose it.
    if (!hasRoom()) return toast(NO_ROOM);
    return open.includes(id) && shownActive() === id ? close(id) : activate(id);
  }

  new ResizeObserver(() => refresh()).observe(workspace);

  return {
    register(pane) { definitions.set(pane.id, pane); },
    toggle,
    /** Opens or shows a pane (a button that "opens the diff" must never close it). */
    open(id) { return hasRoom() ? activate(id) : toast(NO_ROOM); },
    isOpen: id => open.includes(id), // the user's choice (the area may still be hidden for lack of room)
    isActive: id => open.includes(id) && shownActive() === id,
    /** Closes the active tab (Desktop: Ctrl+\); nothing while the area is hidden. */
    closeFocused() { if (!area.hidden && shownActive()) close(shownActive()); },
    refresh,
  };
}
