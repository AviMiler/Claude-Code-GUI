/**
 * Did the running turn change files? The same definition as the changed-files card (public/js/turn-changes.js):
 * successful Edit / MultiEdit / Write / NotebookEdit calls since the turn's start (subagents included), where a turn
 * starts at a user message that is not a correction (public/js/turn-stats.js isTurnStart). Bash-made changes are not seen.
 */
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const isTurnStart = item => item.kind === 'user' && !item.correction;

/** @param {object[]} items session.items @returns {string[]} the paths written in the current turn */
function editedThisTurn(items) {
  let start = items.length;
  while (start > 0 && !isTurnStart(items[start - 1])) start -= 1;
  const turn = items.slice(start);
  const failed = new Set(turn.filter(item => item.kind === 'tool-result' && item.isError).map(item => item.toolUseId));
  const paths = turn.filter(item => item.kind === 'tool' && EDIT_TOOLS.has(item.name) && !failed.has(item.id))
    .map(item => item.input?.file_path || item.input?.notebook_path).filter(Boolean);
  return [...new Set(paths)];
}

module.exports = { editedThisTurn };
