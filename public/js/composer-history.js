/** ↑ / ↓ in the composer: the session's earlier messages, newest first (like the terminal). */

/**
 * @param {HTMLTextAreaElement} textarea @param {()=>string[]} getHistory the session's messages, oldest first
 * @param {()=>void} autosize
 * @returns {{reset:()=>void, handleKey:(event:KeyboardEvent)=>boolean}} handleKey: true when the key stepped the history
 */
export function createHistory(textarea, getHistory, autosize) {
  let index = -1;
  return {
    reset: () => { index = -1; },
    handleKey(event) {
      const history = getHistory();
      if (event.key === 'ArrowUp' && (!textarea.value || index >= 0) && history.length) index = Math.min(index + 1, history.length - 1);
      else if (event.key === 'ArrowDown' && index >= 0) index -= 1;
      else return false;
      event.preventDefault();
      textarea.value = index >= 0 ? history[history.length - 1 - index] : '';
      autosize();
      return true;
    },
  };
}
