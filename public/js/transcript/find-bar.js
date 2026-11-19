/**
 * The Ctrl+F find bar of one transcript (the main pane's or the split pane's): a text box at the top of the thread that
 * searches the session's items with the sidebar's rules (session-search.js) and steps through the matching messages
 * (hit-stepper.js). It has its own state; opening it closes a sidebar result bar of the same transcript (search-hits.js).
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { searchItems } from '../session-search.js';
import { createHitStepper, claimTranscript, releaseTranscript } from './hit-stepper.js';
import { findStatus } from './find-logic.js';

const DEBOUNCE_MS = 150;

/**
 * @param {{messages:HTMLElement, session:()=>object|null, composer:()=>{focus:()=>void}, whenLoaded:(id:string)=>Promise<void>}} pane
 *   messages: the transcript's message list (its parent scrolls); session: the session it shows; composer: focused on Esc;
 *   whenLoaded: resolves when the session's items are loaded (sync/item-sync.js)
 * @returns {{open:()=>void, close:(focusComposer?:boolean)=>void, isOpen:()=>boolean, hasFocus:()=>boolean,
 *   query:()=>string, matched:()=>number, sessionId:()=>string|null}}
 * @example const bar = createFindBar({ messages, session: activeSession, composer: () => composer, whenLoaded }); bar.open()
 */
export function createFindBar({ messages, session, composer, whenLoaded }) {
  let timer = 0;
  let shownFor = null; // the session id the bar was opened for
  let matched = 0;
  const input = h('input', { type: 'text', class: 'find-input', dir: 'auto', placeholder: 'חיפוש בסשן', 'aria-label': 'חיפוש בתוך הסשן', spellcheck: false });
  const count = h('span', { class: 'search-count', 'aria-live': 'polite' });
  const stepper = createHitStepper({ messages, count });
  const step = direction => (timer ? run() : stepper.go(direction)); // a search still waiting: run it (it goes to the first match)
  const bar = h('div', { class: 'search-bar find-bar', role: 'search' }, icon('search'), input, count,
    h('button', { type: 'button', class: 'icon-button', title: 'התאמה קודמת (Shift+Enter)', onClick: () => step(-1) }, icon('chevron-down', 'flip')),
    h('button', { type: 'button', class: 'icon-button', title: 'התאמה הבאה (Enter)', onClick: () => step(1) }, icon('chevron-down')),
    h('button', { type: 'button', class: 'icon-button', title: 'סגירה (Esc)', onClick: () => close(true) }, icon('x')));

  /** Searches now: marks the matches and scrolls to the first; a session still loading its items is searched again once loaded. */
  function run() {
    clearTimeout(timer);
    timer = 0;
    const query = input.value.trim();
    const current = session();
    stepper.clear();
    matched = query && current ? stepper.mark(searchItems(current.items || [], query)?.indexes || []) : 0;
    const status = findStatus(query, matched);
    if (status === null) stepper.go(1); else count.textContent = status;
    if (query && current && !current.itemsRev) {
      whenLoaded(current.id).then(() => { if (isOpen() && shownFor === current.id && session()?.itemsRev && input.value.trim() === query) run(); });
    }
  }
  /** Runs a search that is still waiting for the typing pause. */
  function flush() { if (timer) run(); }

  const isOpen = () => bar.isConnected;

  function open() {
    if (!isOpen()) {
      claimTranscript(messages, close); // closes a sidebar result bar of this transcript first
      shownFor = session()?.id ?? null;
      messages.parentElement.prepend(bar);
      run();
    }
    input.focus();
    input.select();
  }

  /** Closes the bar and removes its highlights. @param {boolean} [focusComposer] Esc or ×: the pane's composer gets the focus */
  function close(focusComposer = false) {
    clearTimeout(timer);
    timer = 0;
    stepper.clear();
    matched = 0;
    bar.remove();
    shownFor = null;
    releaseTranscript(messages, close);
    if (focusComposer) composer()?.focus();
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, DEBOUNCE_MS); });
  bar.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // the page's Esc (bind-shortcuts.js) must not stop a running turn
      close(true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    }
  });

  return {
    open, close, isOpen,
    hasFocus: () => isOpen() && bar.contains(document.activeElement),
    query: () => input.value,
    matched: () => { flush(); return matched; },
    sessionId: () => shownFor,
  };
}
