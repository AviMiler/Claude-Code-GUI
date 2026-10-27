/** Search matches inside the open conversation: highlights the matching messages and steps through them (▲ ▼, Esc). */
import { h } from './dom.js';
import { icon } from './icons.js';

const HIT_CLASS = 'search-hit';
const CURRENT_CLASS = 'search-current';

/**
 * @param {{scroller:HTMLElement, messages:HTMLElement}} elements the thread's scroll container and its message list
 *   (rendered items carry data-item-index, see thread.js)
 * @returns {{show:(indexes:number[], query:string)=>void, clear:()=>void}}
 * @example const hits = createSearchHits({ scroller, messages }); hits.show([3, 9], 'npm')
 */
export function createSearchHits({ scroller, messages }) {
  let bar = null;
  let nodes = [];
  let current = 0;

  function clear() {
    messages.querySelectorAll(`.${HIT_CLASS}`).forEach(node => node.classList.remove(HIT_CLASS, CURRENT_CLASS));
    bar?.remove();
    bar = null;
    nodes = [];
  }

  function go(step) {
    if (!nodes.length) return;
    nodes[current]?.classList.remove(CURRENT_CLASS);
    current = (current + step + nodes.length) % nodes.length;
    nodes[current].classList.add(CURRENT_CLASS);
    nodes[current].scrollIntoView({ block: 'center', behavior: 'smooth' });
    bar.querySelector('.search-count').textContent = `${current + 1} מתוך ${nodes.length}`;
  }

  /** Highlights the given items and scrolls to the first; items without a node of their own are skipped. */
  function show(indexes, query) {
    clear();
    nodes = indexes.map(index => messages.querySelector(`[data-item-index="${index}"]`)).filter(Boolean);
    if (!nodes.length) return;
    nodes.forEach(node => node.classList.add(HIT_CLASS));
    bar = h('div', { class: 'search-bar', role: 'search' },
      icon('search'), h('span', { class: 'search-term', dir: 'auto' }, `"${query}"`), h('span', { class: 'search-count' }),
      h('button', { type: 'button', class: 'icon-button', title: 'התאמה קודמת (Shift+Enter)', onClick: () => go(-1) }, icon('chevron-down', 'flip')),
      h('button', { type: 'button', class: 'icon-button', title: 'התאמה הבאה (Enter)', onClick: () => go(1) }, icon('chevron-down')),
      h('button', { type: 'button', class: 'icon-button', title: 'סגירה (Esc)', onClick: clear }, icon('x')));
    bar.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); clear(); }
      else if (event.key === 'Enter') { event.preventDefault(); go(event.shiftKey ? -1 : 1); }
    });
    scroller.prepend(bar);
    current = -1;
    go(1);
  }

  return { show, clear };
}
