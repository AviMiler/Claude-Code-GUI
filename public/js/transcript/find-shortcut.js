/**
 * Ctrl+F in the GUI (like Claude Desktop): opens the find bar (find-bar.js) of the FOCUSED pane's transcript, the main
 * pane or the split pane. The key is left to the browser's own find when the focus is in a side pane, a tab strip, a
 * modal, popover or dialog, when the pane shows no session, and on a second Ctrl+F in the bar after nothing was found.
 */
import { createFindBar } from './find-bar.js';
import { ctrlFDecision } from './find-logic.js';

/** Where the focus belongs to the browser's own find. */
const BROWSER_OWNED = '#pane-area, [role="tablist"], .modal-backdrop, .modal, .popover, dialog';
/** Open on screen, they own the keyboard (as for Esc in bind-shortcuts.js). */
const MODAL = '.modal-backdrop, .popover, dialog[open]';

/**
 * @param {{pane:{where:()=>'main'|'split', of:(where:'main'|'split')=>{messages:HTMLElement, composer:object, session:()=>object|null}},
 *   whenLoaded:(id:string)=>Promise<void>}} deps pane: split-focused.js; whenLoaded: sync/item-sync.js
 * @returns {{findInSession:()=>boolean, sync:()=>void}} findInSession: the Ctrl+F action (false: not handled, the
 *   browser's find opens); sync: closes a bar whose pane now shows another session (call after any session change)
 * @example const find = createSessionFind({ pane, whenLoaded: id => itemSync.whenLoaded(id) }); find.sync()
 */
export function createSessionFind({ pane, whenLoaded }) {
  const bars = new Map(); // 'main' | 'split' -> its find bar, made on first use

  function barOf(where) {
    if (!bars.has(where)) {
      const part = pane.of(where);
      bars.set(where, createFindBar({ messages: part.messages, session: () => pane.of(where).session(), composer: () => part.composer, whenLoaded }));
    }
    return bars.get(where);
  }

  function findInSession() {
    const where = pane.where();
    const bar = barOf(where);
    const blocked = Boolean(document.activeElement?.closest?.(BROWSER_OWNED) || document.querySelector(MODAL));
    const decision = ctrlFDecision({ blocked, hasSession: Boolean(pane.of(where).session()), focused: bar.hasFocus(), query: bar.query(), matched: bar.matched() });
    if (decision === 'browser') return false;
    bar.open();
    return true;
  }

  function sync() {
    for (const [where, bar] of bars) {
      if (bar.isOpen() && bar.sessionId() !== (pane.of(where).session()?.id ?? null)) bar.close();
    }
  }

  return { findInSession, sync };
}
