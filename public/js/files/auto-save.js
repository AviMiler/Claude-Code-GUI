/**
 * Auto-save for the Files pane editor: an edit is saved a second after typing stops, and at once on blur, before another
 * file or session is shown and when the page is hidden. It only decides WHEN to call `save`; the save itself (one in flight
 * per file, base hash, conflict) lives in files-pane.js. It never saves a file in conflict, so it cannot override silently.
 */
import { isDirty } from './editor-store.js';

const KEY = 'claude-gui.files-autosave';
export const AUTO_SAVE_DELAY_MS = 1000;
const KEEPALIVE_LIMIT = 60000; // a keepalive request body may not pass 64KB

/** @returns {boolean} the remembered choice; on by default */
export function autoSaveEnabled() {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } // storage may be blocked
}

/** @param {boolean} on */
export function setAutoSaveEnabled(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage may be blocked */ }
}

/** Can this state be saved by itself now? (a conflict or a failed save waits for the user: the next keystroke retries a failure) */
const eligible = st => autoSaveEnabled() && Boolean(st.file?.writable) && isDirty(st) && !st.conflict && !st.error;

/**
 * @param {{getState:(sessionId:string)=>object, sessionIds:()=>string[], save:(sessionId:string, options:{overwrite:boolean, auto:boolean, keepalive?:boolean})=>Promise<void>}} deps
 *   save must return the in-flight promise while a save is running
 * @returns {{touch:(sessionId:string)=>void, flush:(sessionId:string, options?:{keepalive?:boolean})=>Promise<void>, flushAll:(options?:{keepalive?:boolean})=>void, cancel:(sessionId:string)=>void}}
 *   touch: an edit was made (restarts the delay); flush: saves now and waits until nothing eligible is left
 */
export function createAutoSave({ getState, sessionIds, save }) {
  const timers = new Map();
  const cancel = id => { clearTimeout(timers.get(id)); timers.delete(id); };

  async function flush(id, { keepalive = false } = {}) {
    cancel(id);
    for (let round = 0; round < 20; round++) { // typing during a save needs another round with the latest text
      const st = getState(id);
      if (st.saving) { await st.saving; continue; }
      if (!eligible(st)) return;
      const big = keepalive && st.draft.length > KEEPALIVE_LIMIT / 3; // UTF-8 can take 3 bytes a character
      await save(id, { overwrite: false, auto: true, keepalive: keepalive && !big });
    }
  }

  function touch(id) {
    cancel(id);
    const st = getState(id);
    st.error = null; // typing again retries after a failed save
    if (eligible(st)) timers.set(id, setTimeout(() => flush(id), AUTO_SAVE_DELAY_MS));
  }

  const flushAll = options => { for (const id of sessionIds()) flush(id, options); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll({ keepalive: true }); });
  window.addEventListener('pagehide', () => flushAll({ keepalive: true }));
  return { touch, flush, flushAll, cancel };
}
