/** The split pane's compact composer actions: send a message to the pane's session, stop its turn. */
import { api } from './api.js';
import { toast } from './ui.js';
import { confirmOutwardCommand, isCancelled } from './risk.js';

/**
 * @param {{input:HTMLTextAreaElement, session:()=>object|null}} options the pane's text box and its current session
 * @returns {{submit:(delivery:'correct'|'queue')=>Promise<void>, stopTurn:()=>Promise<void>}}
 */
export function createSplitSend({ input, session }) {
  return {
    /** @param {'correct'|'queue'} delivery while the session works: into the running turn (Enter) or after it (Alt+Enter) */
    async submit(delivery) {
      const current = session();
      const text = input.value.trim();
      if (!current || !text) return;
      input.value = '';
      try {
        await confirmOutwardCommand(text); // the same warning as the main composer for commands that reach the cloud
        await api.sendMessage(current.id, text, null, null, delivery);
      } catch (error) {
        input.value = text;
        toast(error.message, isCancelled(error) ? 'info' : 'error');
      }
    },

    async stopTurn() {
      const current = session();
      if (!current) return;
      const result = await api.stop(current.id).catch(error => { toast(error.message, 'error'); return null; });
      if (result?.queued?.length) input.value = [...result.queued.map(entry => entry.text), input.value].filter(Boolean).join('\n\n');
    },
  };
}
