/**
 * The transcript view of one thread (main or split pane): applies the session's view mode — Normal and Thinking group
 * tool calls, Verbose shows every row open — and keeps it right as items arrive. thread.js only calls into this.
 */
import { viewModeOf, saveViewMode, nextViewMode } from './view-mode.js';
import { groupAll, groupAppended, refreshGroupOf, refreshAllGroups } from './tool-groups.js';

const topRows = messages => messages.querySelectorAll(':scope > details.tool');

/**
 * @param {HTMLElement} messages the thread's message list
 * @returns {{show:(session:object|null)=>void, appended:(item:object, node:HTMLElement|null)=>void, settled:()=>void,
 *   setMode:(mode:string)=>void, cycle:()=>string, mode:()=>string}}
 * @example const view = createTranscriptView(messages); view.show(session); view.cycle() // 'thinking'
 */
export function createTranscriptView(messages) {
  let session = null;
  let mode = 'normal';

  function apply(previous) {
    messages.dataset.view = mode; // css/transcript.css hides thinking in Normal
    // Verbose opens every row; leaving it closes them again, before grouping moves them (rows opened by hand in another
    // mode stay as they are).
    if (previous === 'verbose' && mode !== 'verbose') topRows(messages).forEach(row => { row.open = false; });
    groupAll(messages, mode);
    if (mode === 'verbose') topRows(messages).forEach(row => { row.open = true; });
  }

  function setMode(next) {
    const previous = mode;
    mode = next;
    if (session) saveViewMode(session.id, next);
    apply(previous);
  }

  return {
    /** A session was drawn from scratch (rows closed): its saved mode applies. */
    show(next) { session = next; mode = viewModeOf(next); apply(null); },
    /** One item arrived live (node: what it drew, null for a tool result that went into its row). */
    appended(item, node) {
      if (item.kind === 'tool-result') return refreshGroupOf(messages.querySelector(`[data-tool-id="${CSS.escape(item.toolUseId)}"]`));
      if (node && mode === 'verbose' && node.parentElement === messages && node.matches('details.tool')) node.open = true;
      return node ? groupAppended(messages, node, mode) : undefined;
    },
    /** The turn ended and unfinished rows were settled. */
    settled: () => refreshAllGroups(messages),
    setMode,
    /** Ctrl+O. @returns {string} the new mode */
    cycle() { setMode(nextViewMode(session, mode)); return mode; },
    mode: () => mode,
  };
}
