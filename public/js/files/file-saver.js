/**
 * Saves the open file of a session. One save in flight per file: a second request gets the same promise (the caller, or
 * auto-save, comes back for a newer edit once it is done). The base hash used for conflict detection is taken from each
 * successful answer, a conflict (412) is left for the user, and the textarea is never touched (undo history survives).
 */
import { api } from '../api.js';
import { toast } from '../ui.js';
import { invalidateSessionFetches } from '../panes/session-fetch.js';
import { filesState } from './editor-store.js';

/**
 * @param {{onChange:(sessionId:string, finished:boolean)=>void}} deps called when a save starts and when it ends
 * @returns {{save:(sessionId:string, options?:{overwrite?:boolean, auto?:boolean, keepalive?:boolean})=>Promise<void>}}
 *   auto: no toast (the editor header shows the state); overwrite: the user chose to replace the changed file
 */
export function createSaver({ onChange }) {
  async function run(id, st, { overwrite, auto, keepalive }) {
    const file = st.file;
    try {
      const { path, hash, eol, bom } = file;
      const sent = st.draft; // typing while the request is out stays an unsaved edit
      const saved = await api.saveFile(id, { path, content: sent, baseHash: hash, eol, bom, overwrite }, { keepalive });
      if (st.file !== file) return; // another file was opened meanwhile
      Object.assign(file, saved, { content: sent }); // the new hash is the base of the next save
      Object.assign(st, { conflict: false, error: null, saved: true });
      invalidateSessionFetches(id); // the Changes pane and the rail show the edit
      if (!auto) toast('נשמר');
    } catch (error) {
      if (st.file !== file) return;
      if (error.status === 412) st.conflict = true; // auto-save pauses until the user chooses
      else { st.error = error.message; if (!auto) toast(error.message, 'error'); }
    } finally {
      st.saving = null;
      onChange(id, true);
    }
  }

  function save(id, { overwrite = false, auto = false, keepalive = false } = {}) {
    const st = filesState(id);
    if (!st.file?.writable) return Promise.resolve();
    if (st.saving) return st.saving;
    if (auto && st.conflict) return Promise.resolve(); // auto-save never retries a conflict by itself
    st.saving = run(id, st, { overwrite, auto, keepalive });
    onChange(id, false);
    return st.saving;
  }

  return { save };
}
