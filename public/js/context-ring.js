/**
 * The composer's context ring: how full the conversation's context is against the model's real window
 * (context/context-info.js). Accent below the warning level, warning colour from it, danger past the window (full
 * ring); an estimate is drawn fainter. A click opens the usage panel.
 */
import { h } from './dom.js';
import { contextLevel, describeContext } from './context/context-info.js';

const RING_LENGTH = 2 * Math.PI * 9;

export function contextRing() {
  const svg = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="track" cx="12" cy="12" r="9" fill="none" stroke-width="3"/>`
    + `<circle class="fill" cx="12" cy="12" r="9" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 ${RING_LENGTH}"/></svg>`;
  return h('button', { type: 'button', class: 'context-ring', title: 'ניצול הקשר', 'aria-label': 'ניצול הקשר', html: svg, hidden: true });
}

/** @param {HTMLElement} ring @param {ReturnType<import('./context/context-info.js').contextInfo>} info null: nothing known (hidden) */
export function drawContextRing(ring, info) {
  ring.hidden = !info;
  if (!info) return;
  const tip = describeContext(info);
  ring.title = `${tip}\n(לחיצה: פירוט ופעולות)`;
  ring.setAttribute('aria-label', tip.split('\n')[0]);
  ring.dataset.level = contextLevel(info);
  ring.toggleAttribute('data-estimate', info.isEstimate);
  ring.querySelector('.fill').setAttribute('stroke-dasharray', `${(RING_LENGTH * Math.min(Math.max(info.percent, 0), 100)) / 100} ${RING_LENGTH}`);
}
