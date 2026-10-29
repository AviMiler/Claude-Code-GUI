/**
 * Claude's crab mascot. `data-state` says what Claude is doing, `data-b` (1..3) which of that state's three behaviors
 * plays; the behavior is re-rolled at random on every state change and every few seconds while a state loops.
 * Every change plays a short squash-and-pop (class .swap) so the switch reads as a move, not a cut.
 * All motion is CSS in css/animations.css.
 */
const BEHAVIORS = 3;
const REROLL_MS = 5000;
const ONE_SHOT = new Set(['done', 'error', 'stopped']);

const SVG = '<svg viewBox="0 0 18 12" shape-rendering="crispEdges" fill="currentColor">'
  + '<rect class="c-shadow" x="3" y="11.6" width="12" height="1"/>'
  + '<g class="c-all"><g class="c-body"><rect x="3" y="0" width="12" height="9"/>'
  + '<rect class="c-arm c-arm-l" x="0" y="3" width="3" height="3"/><rect class="c-arm c-arm-r" x="15" y="3" width="3" height="3"/>'
  + '<g class="c-eyes" fill="#1f1f1f"><rect x="5" y="1" width="1" height="2"/><rect x="12" y="1" width="1" height="2"/></g></g>'
  + '<rect class="c-leg c-leg-a" x="3" y="9" width="1" height="3"/><rect class="c-leg c-leg-b" x="6" y="9" width="1" height="3"/>'
  + '<rect class="c-leg c-leg-b" x="11" y="9" width="1" height="3"/><rect class="c-leg c-leg-a" x="14" y="9" width="1" height="3"/></g>'
  + '<g class="c-x c-dots"><rect x="13" y="-1.5" width="1" height="1"/><rect x="15" y="-3" width="1" height="1"/><rect x="17" y="-4.5" width="1" height="1"/></g>'
  + '<g class="c-x c-bang"><rect x="16" y="-6" width="1" height="3"/><rect x="16" y="-2" width="1" height="1"/></g>'
  + '<g class="c-x c-q"><rect x="15" y="-6" width="3" height="1"/><rect x="17" y="-5" width="1" height="1"/><rect x="16" y="-4" width="1" height="1"/><rect x="16" y="-2" width="1" height="1"/></g>'
  + '<g class="c-x c-sparks"><rect x="-2" y="-1" width="1" height="1"/><rect x="19" y="-2" width="1" height="1"/><rect x="8" y="-4" width="1" height="1"/></g>'
  + '<g class="c-x c-sweat"><rect x="16" y="1" width="1" height="2"/></g></svg>';

function roll(node) {
  const before = Number(node.dataset.b) || 0;
  let next;
  do next = 1 + Math.floor(Math.random() * BEHAVIORS); while (next === before);
  node.dataset.b = next;
  node.classList.remove('swap');
  void node.offsetWidth; // restarts the swap animation when it is still on from the previous change
  node.classList.add('swap');
}

/**
 * @param {string} [className] Extra class names.
 * @returns {HTMLSpanElement} A crab in the idle state; a click picks another idle behavior.
 * @example row.append(crab())
 */
export function crab(className = '') {
  const span = document.createElement('span');
  span.className = `icon crab ${className}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.dataset.state = 'idle';
  span.innerHTML = SVG;
  roll(span);
  span.addEventListener('click', () => roll(span));
  return span;
}

/** @param {Element|null|undefined} node A crab. @param {string} state idle|starting|thinking|writing|tool|waiting|done|error|stopped */
export function setCrabState(node, state) {
  if (!node || node.dataset.state === state) return;
  node.dataset.state = state;
  roll(node);
}

setInterval(() => {
  for (const node of document.querySelectorAll('.crab')) if (!ONE_SHOT.has(node.dataset.state)) roll(node);
}, REROLL_MS);
