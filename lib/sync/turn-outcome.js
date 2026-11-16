/**
 * How the turn that just ended went, from the items after its start, sent with the `status: idle` event so a browser
 * that holds no items of the session (lazy loading) can still notify. Same rules the browser used before
 * (public/js/events.js): a user stop tells nothing, an error item, a loop stop or a failed result is an error.
 */
const isTurnStart = item => item.kind === 'user' && !item.correction;

/**
 * @param {object[]} items the session's items
 * @returns {'done'|'error'|null} null when the user stopped the turn
 * @example turnOutcome([{ kind: 'user', text: 'hi' }, { kind: 'result', isError: false }]) // 'done'
 */
function turnOutcome(items = []) {
  let start = items.length;
  while (start > 0 && !isTurnStart(items[start - 1])) start -= 1;
  const turn = items.slice(start);
  if (turn.some(item => item.kind === 'notice' && item.stopped)) return null;
  return turn.some(item => item.kind === 'error' || item.loopStopped || (item.kind === 'result' && item.isError)) ? 'error' : 'done';
}

module.exports = { turnOutcome };
