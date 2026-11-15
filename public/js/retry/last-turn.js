/** The last turn of a session as the retry and compare buttons see it: its user message (a rewind point) and whether it changed files. */
import { turnChanges } from '../turn-changes.js';

/**
 * @param {object|null} session
 * @returns {{item:object, index:number}|null} the last user message when it is a message the CLI can go back to and
 *   the session is idle; null otherwise (the server still has the last word: 409 with the reason)
 */
export function lastPoint(session) {
  if (!session || session.status === 'running' || session.archived) return null;
  const items = session.items || [];
  const index = items.findLastIndex(item => item.kind === 'user' && !item.correction);
  const item = items[index];
  if (!item || !item.cliUuid || !item.text || item.afterUuid === false) return null;
  return { item, index };
}

/** True when the turn that followed the user message at `index` wrote files (tool calls of the edit tools). */
export function changedFiles(session, index) {
  const resultIndex = session.items.findLastIndex(item => item.kind === 'result');
  return resultIndex > index && turnChanges(session.items, resultIndex).length > 0;
}
