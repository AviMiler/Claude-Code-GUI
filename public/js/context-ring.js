/** The composer's context ring: how full the conversation's context is (a click opens the usage panel). */
import { h } from './dom.js';

const RING_LENGTH = 2 * Math.PI * 9;

export function contextRing() {
  const svg = `<svg viewBox="0 0 24 24"><circle class="track" cx="12" cy="12" r="9" fill="none" stroke-width="3"/>`
    + `<circle class="fill" cx="12" cy="12" r="9" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 ${RING_LENGTH}"/></svg>`;
  return h('button', { type: 'button', class: 'context-ring', title: 'ניצול הקשר', html: svg, hidden: true });
}

/** @param {HTMLElement} ring @param {number} percent below 0: not known (hidden) */
export function drawContextRing(ring, percent) {
  ring.hidden = !(percent >= 0);
  if (!(percent >= 0)) return;
  ring.title = `ניצול הקשר: ${percent}%`;
  ring.querySelector('.fill').setAttribute('stroke-dasharray', `${(RING_LENGTH * Math.min(percent, 100)) / 100} ${RING_LENGTH}`);
}
