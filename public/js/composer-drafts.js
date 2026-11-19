/**
 * Unsent composer drafts (text and attachments), one per session, shared by every composer on the page: a session shows
 * its own draft in whichever pane it is opened, and a draft never follows the box to another session. The welcome page
 * (a new session, main pane only) has its own draft under NEW_DRAFT. Browser memory only, like before (a reload empties it).
 */

/** The draft key of the main pane while no session is open (the welcome page). */
export const NEW_DRAFT = 'new';

const drafts = new Map(); // key -> { text, attachments }

/**
 * Binds one composer's box to the draft of the session it shows.
 * @param {{textarea:HTMLTextAreaElement, files:{get:()=>object[], set:(list:object[])=>void}, onSwitch:()=>void}} parts
 *   onSwitch: the box now shows another session's draft (close menus, reset the history step)
 * @returns {{save:()=>void, bind:(key:string|null)=>void}} save: stores what the box holds now (call after every change);
 *   bind: shows the draft of `key` (null: a pane without a session, nothing is stored)
 */
export function createDraftSlot({ textarea, files, onSwitch }) {
  let key; // undefined until the first bind
  let loading = false;

  function save() {
    if (loading || key === null || key === undefined) return;
    const text = textarea.value;
    const attachments = files.get();
    if (text || attachments.length) drafts.set(key, { text, attachments });
    else drafts.delete(key);
  }

  function bind(next) {
    if (next === key) return;
    key = next;
    const draft = (next !== null && drafts.get(next)) || { text: '', attachments: [] };
    loading = true; // the box's own change handlers must not store the half-loaded draft
    try {
      textarea.value = draft.text;
      files.set(draft.attachments);
    } finally { loading = false; }
    onSwitch();
  }

  return { save, bind };
}
