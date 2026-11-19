/**
 * The floating "jump to latest" button of a transcript: appears while the user has scrolled up, shows a dot when new output
 * grew the transcript meanwhile, and a click scrolls to the end (auto-follow is "near the bottom", so it resumes by itself).
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';

const AWAY_PX = 140;

/**
 * @param {HTMLElement} scroller the scroll container (the button lives inside it, sticky at its bottom) @param {HTMLElement} messages the list inside it
 * @returns {{update:()=>void}} update re-reads the scroll position
 */
export function attachJumpLatest(scroller, messages) {
  let fresh = false;
  let lastHeight = scroller.scrollHeight;
  const dot = h('span', { class: 'jump-dot', hidden: true, 'aria-hidden': 'true', title: 'הודעות חדשות' }); // the transcript is already aria-live: no second announcement
  const button = h('button', { type: 'button', class: 'jump-latest', hidden: true, title: 'קפיצה לסוף', 'aria-label': 'קפיצה לסוף' }, icon('arrow-down'), dot);
  const away = () => scroller.clientHeight > 0 && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > AWAY_PX;
  function update() {
    const isAway = away();
    if (!isAway) fresh = false;
    button.hidden = !isAway;
    dot.hidden = !fresh;
    button.setAttribute('aria-label', fresh ? 'קפיצה לסוף, יש הודעות חדשות' : 'קפיצה לסוף');
  }
  button.addEventListener('click', () => {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: calm ? 'auto' : 'smooth' });
  });
  scroller.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(() => { // output that grows the transcript while the user is away from the end
    if (scroller.scrollHeight > lastHeight && away()) fresh = true;
    lastHeight = scroller.scrollHeight;
    update();
  }).observe(messages);
  scroller.append(h('div', { class: 'jump-latest-anchor' }, button));
  return { update };
}
