/** Search matches of a sidebar result inside the open conversation: highlights the matching messages and steps through them (▲ ▼, Esc). */
import { h } from './dom.js';
import { icon } from './icons.js';
import { createHitStepper, claimTranscript, releaseTranscript, hasVisibleHit } from './transcript/hit-stepper.js';

/**
 * @param {{scroller:HTMLElement, messages:HTMLElement}} elements the thread's scroll container and its message list
 *   (rendered items carry data-item-index, see thread.js)
 * @returns {{show:(indexes:number[], query:string)=>void, clear:()=>void}}
 * @example const hits = createSearchHits({ scroller, messages }); hits.show([3, 9], 'npm')
 */
export function createSearchHits({ scroller, messages }) {
  let bar = null;
  let stepper = null;

  function clear() {
    stepper?.clear();
    bar?.remove();
    bar = stepper = null;
    releaseTranscript(messages, clear);
  }

  /** Highlights the given items and scrolls to the first; nothing is shown when none of them has a visible node. */
  function show(indexes, query) {
    clear();
    if (!hasVisibleHit(messages, indexes)) return; // nothing to show: an open Ctrl+F bar stays
    const count = h('span', { class: 'search-count' });
    const next = createHitStepper({ messages, count });
    claimTranscript(messages, clear); // closes a Ctrl+F bar of this transcript first (find-bar.js), before marking
    if (!next.mark(indexes)) { releaseTranscript(messages, clear); return; }
    stepper = next;
    bar = h('div', { class: 'search-bar', role: 'search' },
      icon('search'), h('span', { class: 'search-term', dir: 'auto' }, `"${query}"`), count,
      h('button', { type: 'button', class: 'icon-button', title: 'התאמה קודמת (Shift+Enter)', onClick: () => stepper.go(-1) }, icon('chevron-down', 'flip')),
      h('button', { type: 'button', class: 'icon-button', title: 'התאמה הבאה (Enter)', onClick: () => stepper.go(1) }, icon('chevron-down')),
      h('button', { type: 'button', class: 'icon-button', title: 'סגירה (Esc)', onClick: clear }, icon('x')));
    bar.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); clear(); }
      else if (event.key === 'Enter') { event.preventDefault(); stepper.go(event.shiftKey ? -1 : 1); }
    });
    scroller.prepend(bar);
    stepper.go(1);
  }

  return { show, clear };
}
