/** The decisions of the Ctrl+F find bar (find-bar.js, find-shortcut.js), kept free of the DOM so they can be unit tested. */

export const NO_MATCHES = 'אין התאמות';

/**
 * What Ctrl+F does now.
 * @param {{blocked:boolean, hasSession:boolean, focused:boolean, query:string, matched:number}} at blocked: the focus is in a
 *   side pane, a tab strip, a modal, popover or dialog (or one is open); focused: the focus is in the pane's find bar;
 *   matched: the matches of its current query
 * @returns {'browser'|'open'} browser: leave the key to the browser's own find (no preventDefault); open: open or focus the bar
 * @example ctrlFDecision({ blocked: false, hasSession: true, focused: true, query: 'xyz', matched: 0 }) // 'browser'
 */
export function ctrlFDecision({ blocked, hasSession, focused, query, matched }) {
  if (blocked || !hasSession) return 'browser';
  if (focused && query.trim() && !matched) return 'browser'; // a second Ctrl+F after nothing was found: the browser's find
  return 'open';
}

/**
 * The bar's count line before the stepper writes "k מתוך N".
 * @param {string} query @param {number} matched
 * @returns {string|null} '' for an empty query, "אין התאמות" when nothing matched, null when the stepper writes the count
 */
export function findStatus(query, matched) {
  if (!query.trim()) return '';
  return matched ? null : NO_MATCHES;
}
