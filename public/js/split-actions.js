/** What the split pane's composer does, always to the pane's own session (never the active one): send, stop, queue, mode and settings. */
import { api } from './api.js';
import { state } from './state.js';
import { forServer, fromStored } from './attachments.js';
import { availableModes, MODE_CYCLE } from './modes.js';
import { rememberFolderSettings } from './folder-defaults.js';
import { toast } from './ui.js';
import { confirmMode, confirmOutwardCommand, isCancelled } from './risk.js';

/**
 * @param {{session:()=>object|null, refresh:()=>void, restore:(entries:object[])=>void, askSide:(id:string, question:string)=>void,
 *   focusSide:(id:string)=>void, openPanel:(id:string)=>void}} deps session: the pane's session; restore: puts messages back
 *   in the pane's box; askSide / focusSide: the side question tab; openPanel: a panel (it opens for the main pane's session)
 * @returns {object} the actions the chip menus and the composer call (the shape of actions.js, for the pane's session)
 */
export function createSplitActions({ session, refresh, restore, askSide, focusSide, openPanel }) {
  const report = error => toast(error.message, isCancelled(error) ? 'info' : 'error');
  const actions = {
    openPanel,
    /** @param {'correct'|'queue'} [delivery] while the session works: into the running turn or after it @returns {Promise<boolean>} accepted */
    async send(text, attachments = [], delivery) {
      const current = session();
      if (!current) return false;
      try {
        await confirmOutwardCommand(text); // the same warning as the main composer for commands that reach the cloud
        const { images, files } = forServer(attachments);
        await api.sendMessage(current.id, text, images, files, delivery);
        return true;
      } catch (error) { report(error); return false; }
    },
    /** Stops the pane's turn; queued messages come back into the pane's box. */
    async stop() {
      const current = session();
      if (current?.status !== 'running') return;
      const result = await api.stop(current.id).catch(report);
      if (result?.queued?.length) {
        restore(result.queued.map(entry => ({ text: entry.text, attachments: fromStored(entry) })));
        toast('ההודעות שבתור הוחזרו לתיבת הכתיבה');
      }
    },
    /** /btw: the side question tab of the pane's session ("" only puts the cursor in its input). */
    sideQuestion(question) {
      const current = session();
      if (!current) return;
      if (question) askSide(current.id, question); else focusSide(current.id);
    },
    removeQueued(entry) {
      const current = session();
      if (current) api.removeQueued(current.id, entry.id).catch(report);
    },
    async editQueued(entry) {
      const current = session();
      if (current) await api.removeQueued(current.id, entry.id).then(() => restore([{ text: entry.text, attachments: fromStored(entry) }])).catch(report);
    },
    resumeQueue() {
      const current = session();
      if (current) api.resumeQueue(current.id).catch(report);
    },
    async updateSettings(patch) {
      const current = session();
      if (!current) return;
      if (patch.mode && patch.mode !== current.mode) await confirmMode(patch.mode);
      await api.updateSession(current.id, patch);
      rememberFolderSettings(current.cwd, patch);
      refresh();
    },
    setMode: mode => actions.updateSettings({ mode }).catch(report),
    trySettings: patch => actions.updateSettings(patch).catch(report),
    cycleMode() {
      const cycle = MODE_CYCLE.filter(mode => availableModes(state.capabilities.permissionModes).some(item => item.value === mode));
      actions.setMode(cycle[(cycle.indexOf(session()?.mode) + 1) % cycle.length]);
    },
  };
  return actions;
}
