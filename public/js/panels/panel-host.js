/**
 * Settings-style modal (like Claude desktop): navigation on the side, one panel at a time.
 * Every slash command that has a GUI equivalent opens here at its panel.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { PANELS } from './registry.js';

const GROUP_LABELS = { session: 'סשן', extend: 'הרחבות', setup: 'הגדרות ועזרה' };
let current = null;

/**
 * @param {string} panelId
 * @param {() => object} makeContext Builds the panel context (scope, api, insert, send, ...), called per render.
 */
export function openPanel(panelId, makeContext) {
  if (current) return current.show(panelId);
  const nav = h('nav', { class: 'modal-nav', 'aria-label': 'אזורי הגדרות' }, h('h2', null, 'Claude Code'));
  const title = h('h3');
  const contextLabel = h('span', { class: 'context-label' });
  const content = h('div', { class: 'modal-content' });
  const closeButton = h('button', { type: 'button', class: 'icon-button', title: 'סגירה (Esc)' }, icon('x'));
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, nav,
    h('div', { class: 'modal-body' }, h('div', { class: 'modal-head' }, title, contextLabel, closeButton), content));
  const backdrop = h('div', { class: 'modal-backdrop' }, modal);
  const buttons = new Map();

  let lastGroup = null;
  for (const panel of PANELS) {
    if (panel.group !== lastGroup) nav.append(h('div', { class: 'nav-group' }, GROUP_LABELS[panel.group]));
    lastGroup = panel.group;
    const button = h('button', { type: 'button', onClick: () => show(panel.id) }, icon(panel.icon), panel.title);
    buttons.set(panel.id, button);
    nav.append(button);
  }

  function close() {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    current = null;
  }
  function onKey(event) {
    if (event.key === 'Escape' && !document.querySelector('dialog[open], .popover')) { event.preventDefault(); close(); }
  }

  async function show(id) {
    const panel = PANELS.find(item => item.id === id) || PANELS[0];
    buttons.forEach((button, key) => button.setAttribute('aria-current', String(key === panel.id)));
    title.textContent = panel.title;
    content.replaceChildren();
    content.scrollTop = 0;
    const context = { ...makeContext(), close, open: show, rerender: () => show(panel.id) };
    contextLabel.textContent = context.folder || '';
    contextLabel.title = context.folder || '';
    try {
      await panel.render(content, context);
    } catch (error) {
      console.error(`[panel-host] ${panel.id} failed:`, error);
      content.append(h('div', { class: 'error-box' }, error.message));
    }
  }

  closeButton.addEventListener('click', close);
  backdrop.addEventListener('mousedown', event => { if (event.target === backdrop) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  current = { show, close };
  show(panelId);
  return current;
}

export const closePanel = () => current?.close();
