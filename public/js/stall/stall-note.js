/**
 * The working line's extra parts (working-line.js): "מקום N בתור למודל" while the turn waits for the model server
 * (lib/model-gate/), "בדיקה אוטומטית רצה…" while session meta `verifying` is set, and past `config.stallSeconds` without a
 * CLI event "N שניות מאז הטוקן האחרון" with a Stop button. Nothing here stops by itself. Updated in place by the line's
 * per-second tick: the line node is never moved (that would restart the crab's animation).
 */
import { h } from '../dom.js';
import { state } from '../state.js';
import { stallInfo } from './stall-clock.js';

/** The session a working line shows: the split pane's, or the main thread's (the active session). */
const sessionOf = node => node.closest('.split-pane')?.dataset.splitSession || state.activeId;

/** The Stop of the composer next to this line (main or split pane), so Stop behaves exactly as there (queue texts return). */
function stopNear(node) {
  const pane = node.closest('.split-pane');
  (pane ? pane.querySelector('.stop-button') : document.querySelector('#composer-area .send-button.stop'))?.click();
}

/** @returns {HTMLElement} the box appended to the working line once, at its creation */
export function stallBox() {
  const stop = h('button', { type: 'button', class: 'stall-stop', title: 'עצירת הריצה', hidden: true }, 'עצירה');
  stop.addEventListener('click', () => stopNear(stop));
  return h('span', { class: 'stall-box' }, h('span', { class: 'stall-text', 'aria-live': 'polite' }), stop);
}

/**
 * The verb while the turn waits for the model server, or null. Not before the line is in the page (its session is
 * read from where it sits).
 */
export function gateVerb(line) {
  if (!line?.isConnected) return null;
  const wait = state.sessions.get(sessionOf(line))?.modelWait;
  return wait ? `מקום ${wait.place} בתור למודל` : null;
}

/** @param {HTMLElement} line the working line @param {boolean} waiting a permission prompt is pending */
export function renderStall(line, waiting) {
  const box = line.querySelector('.stall-box');
  if (!box || !line.isConnected) return;
  const { verifying, stalledSeconds } = stallInfo(sessionOf(line), waiting);
  const text = verifying ? 'בדיקה אוטומטית רצה…' : stalledSeconds !== null ? `${stalledSeconds} שניות מאז הטוקן האחרון` : '';
  const textNode = box.querySelector('.stall-text');
  if (textNode.textContent !== text) textNode.textContent = text;
  box.dataset.stalled = String(stalledSeconds !== null && !verifying);
  box.querySelector('.stall-stop').hidden = stalledSeconds === null || verifying;
}
