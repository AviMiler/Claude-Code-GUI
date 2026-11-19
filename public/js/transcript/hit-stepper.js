/**
 * The highlighted matches of one search bar in one transcript (search-hits.js for a sidebar result, find-bar.js for
 * Ctrl+F): marks the matching item nodes, steps through them and writes "k מתוך N". A transcript shows one bar at a time:
 * a bar that opens closes the other bar of the same transcript first (claim), so no classes are left behind.
 */
import { revealNode, canReveal } from './reveal.js';

const HIT_CLASS = 'search-hit';
const CURRENT_CLASS = 'search-current';
const owners = new WeakMap(); // messages element -> close() of the bar that shows there now

/**
 * Makes `close` the bar of this transcript, closing the bar that had it.
 * @param {HTMLElement} messages the transcript's message list
 * @param {()=>void} close closes the claiming bar (called when another bar claims the transcript)
 */
export function claimTranscript(messages, close) {
  const previous = owners.get(messages);
  owners.set(messages, close);
  if (previous && previous !== close) previous();
}

/** Forgets `close` as the transcript's bar (it closed by itself). */
export function releaseTranscript(messages, close) {
  if (owners.get(messages) === close) owners.delete(messages);
}

/** The visible item nodes of the given indexes (a node hidden by the view mode is skipped). */
const hitNodes = (messages, indexes) => indexes.map(index => messages.querySelector(`[data-item-index="${index}"]`)).filter(node => node && canReveal(node));

/** Whether any of the given items has a visible node, so a bar about to open has something to show. */
export const hasVisibleHit = (messages, indexes) => hitNodes(messages, indexes).length > 0;

/**
 * @param {{messages:HTMLElement, count:HTMLElement}} elements the message list (items carry data-item-index, thread.js) and
 *   where "k מתוך N" is written
 * @returns {{mark:(indexes:number[])=>number, go:(step:number)=>void, clear:()=>void, size:()=>number}}
 * @example const hits = createHitStepper({ messages, count }); if (hits.mark([3, 9])) hits.go(1)
 */
export function createHitStepper({ messages, count }) {
  let nodes = [];
  let current = -1;

  /** Removes this stepper's marks (only its own nodes: another transcript's marks stay). */
  function clear() {
    nodes.forEach(node => node.classList.remove(HIT_CLASS, CURRENT_CLASS));
    nodes = [];
    current = -1;
    count.textContent = '';
  }

  /** Marks the given items; items without a node of their own, or hidden by the view mode, are skipped. @returns {number} nodes marked */
  function mark(indexes) {
    clear();
    nodes = hitNodes(messages, indexes);
    nodes.forEach(node => node.classList.add(HIT_CLASS));
    return nodes.length;
  }

  /** Moves to the next (+1) or previous (-1) match and scrolls to it; a match inside a collapsed tool group or row opens first. */
  function go(step) {
    if (!nodes.length) return;
    nodes[current]?.classList.remove(CURRENT_CLASS);
    current = current < 0 ? (step > 0 ? 0 : nodes.length - 1) : (current + step + nodes.length) % nodes.length;
    nodes[current].classList.add(CURRENT_CLASS);
    revealNode(nodes[current]);
    nodes[current].scrollIntoView({ block: 'center', behavior: 'smooth' });
    count.textContent = `${current + 1} מתוך ${nodes.length}`;
  }

  return { mark, go, clear, size: () => nodes.length };
}
