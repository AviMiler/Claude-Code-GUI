/**
 * The tab strip at the top of the pane area: one tab per open pane (icon, title, close "x"), the active one marked.
 * Tabs are updated in place (never rebuilt) so a focused tab keeps its focus across the frequent refreshes.
 * When the titles do not fit, background tabs shrink to their icon; if even that overflows, the strip scrolls.
 * Keyboard: arrows (mirrored in RTL), Home / End move between tabs; Enter / Space activate; Delete closes.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';

/**
 * @param {{strip:HTMLElement, onSelect:(id:string)=>void, onClose:(id:string)=>void}} options
 * @returns {{update:(panes:{id:string,title:string,icon:string}[], activeId:string)=>void}}
 */
export function createPaneTabs({ strip, onSelect, onClose }) {
  const tabs = new Map(); // id -> { wrap, tab, close }
  let shownKey = '';
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'חלוניות פתוחות');

  function tabFor(pane) {
    if (tabs.has(pane.id)) return tabs.get(pane.id);
    const tab = h('button', { type: 'button', class: 'pane-tab-main', role: 'tab', id: `pane-tab-${pane.id}`,
      'aria-controls': `pane-${pane.id}`, title: pane.title, onClick: () => onSelect(pane.id) },
    icon(pane.icon), h('span', { class: 'pane-tab-title' }, pane.title));
    const close = h('button', { type: 'button', class: 'pane-tab-close', title: `סגירת ${pane.title} (Ctrl+\\)`,
      'aria-label': `סגירת ${pane.title}`, onClick: () => onClose(pane.id) }, icon('x'));
    const wrap = h('div', { class: 'pane-tab', dataset: { pane: pane.id } }, tab, close);
    wrap.addEventListener('auxclick', event => { if (event.button === 1) onClose(pane.id); }); // middle click, like a browser
    tabs.set(pane.id, { wrap, tab, close });
    return tabs.get(pane.id);
  }

  strip.addEventListener('keydown', event => {
    const ids = [...strip.children].map(node => node.dataset.pane);
    const current = ids.indexOf(event.target.closest('.pane-tab')?.dataset.pane);
    if (current < 0) return;
    const rtl = getComputedStyle(strip).direction === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
    let next = null;
    if (step) next = (current + step + ids.length) % ids.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else if (event.key === 'Delete') { event.preventDefault(); onClose(ids[current]); return; }
    if (next === null) return;
    event.preventDefault();
    onSelect(ids[next]);
    tabs.get(ids[next])?.tab.focus();
  });

  /** Titles while they fit; when they do not, background tabs show their icon only (the title stays the tooltip). */
  function fit() {
    if (!strip.isConnected || !strip.clientWidth) return;
    strip.classList.remove('compact');
    if (strip.scrollWidth > strip.clientWidth + 1) strip.classList.add('compact');
  }
  new ResizeObserver(fit).observe(strip);

  function update(panes, activeId) {
    const wanted = panes.map(pane => tabFor(pane).wrap);
    // Re-attach only when the order changed: moving a focused tab would drop its focus.
    if (wanted.some((node, index) => strip.children[index] !== node) || strip.children.length !== wanted.length) strip.replaceChildren(...wanted);
    for (const pane of panes) {
      const { wrap, tab, close } = tabs.get(pane.id);
      const active = pane.id === activeId;
      wrap.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      close.tabIndex = active ? 0 : -1;
    }
    fit();
    const key = `${activeId}|${panes.length}`;
    if (key !== shownKey) tabs.get(activeId)?.wrap.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // keep it visible when the strip overflows
    shownKey = key;
  }

  return { update };
}
