/** A `!` command's output while it runs, as a card at the end of the conversation (the saved card replaces it). */
import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../ui.js';
import { shellBlock } from './shell-block.js';
import { onShellRun } from './shell-store.js';

/** @param {{scroller:HTMLElement, messages:HTMLElement}} elements */
export function showLiveShells({ scroller, messages }) {
  const cards = new Map(); // runId -> its block
  onShellRun((run, phase) => {
    if (run.source !== 'bang' || run.sessionId !== state.activeId) return;
    const stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
    if (phase === 'start') {
      const card = shellBlock(run, { onStop: () => api.stopShell(run.sessionId).catch(error => toast(error.message, 'error')) });
      card.classList.add('shell-live');
      cards.set(run.runId, card);
      messages.append(card);
    } else if (phase === 'end') {
      cards.get(run.runId)?.remove();
      cards.delete(run.runId);
    } else cards.get(run.runId)?.update(run);
    if (stick) scroller.scrollTop = scroller.scrollHeight;
  });
}
