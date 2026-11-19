/**
 * "הוספה לצ'אט" (Claude Desktop): a text selection in the transcript, the Files viewer or editor, or a diff of the Changes
 * pane shows a floating button; its click puts the selection as a quote into the FOCUSED pane's composer (that session's
 * draft) and never sends. No context-menu entry: the browser's own menu stays on a selection. Delegated document
 * listeners only, so the panes that draw these views know nothing of it.
 */
import { toast } from '../ui.js';
import { createQuoteButton } from './quote-button.js';
import { readSelection } from './selection-sources.js';
import { formatQuote, appendQuote, QUOTE_LIMIT } from './quote-format.js';

/**
 * @param {{pane:{composer:()=>{textarea:HTMLTextAreaElement, insert:(text:string, options?:{replace?:boolean})=>void}}}} parts
 *   pane: split-focused.js (the focused pane's composer)
 */
export function enableQuoteSelection({ pane }) {
  let pointer = null; // where the mouse was released last (the editor's selection has no boxes of its own)
  let pressed = false; // no button while a selection is being dragged
  let timer = 0;
  let source = null;
  const button = createQuoteButton(add);

  function hide() { clearTimeout(timer); source = null; button.hide(); }

  function update() {
    clearTimeout(timer); // after the burst of selectionchange / pointerup / keyup events of one gesture
    timer = setTimeout(() => {
      source = pressed ? null : readSelection(pointer);
      if (source) button.show(source.rect, source.host);
      else button.hide();
    }, 30);
  }

  function add() {
    const picked = source;
    hide();
    if (!picked) return;
    if (picked.text.length > QUOTE_LIMIT) { toast(`הטקסט המסומן ארוך מדי להוספה לצ'אט (עד ${QUOTE_LIMIT.toLocaleString('he-IL')} תווים).`, 'error'); return; }
    const quote = formatQuote(picked);
    if (!quote) return;
    const dialog = picked.host.closest?.('dialog');
    if (dialog) dialog.dispatchEvent(new Event('cancel', { cancelable: true })); // the viewer closes, so the composer can take focus
    getSelection()?.removeAllRanges();
    const box = pane.composer();
    box.insert(appendQuote(box.textarea.value, quote), { replace: true }); // stored as that session's draft (composer.js autosize)
  }

  document.addEventListener('selectionchange', update);
  document.addEventListener('pointerdown', event => { if (!button.node.contains(event.target)) { pressed = true; hide(); } }, true);
  document.addEventListener('pointerup', event => { pressed = false; pointer = { x: event.clientX, y: event.clientY }; update(); }, true);
  document.addEventListener('keyup', event => { if (event.key !== 'Escape') update(); }, true);
  document.addEventListener('select', update, true); // a text area's selection (the Files editor)
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, true);
  document.addEventListener('scroll', event => { if (event.target !== button.node) hide(); }, true);
  document.addEventListener('focusin', event => { if (event.target !== button.node) hide(); }, true);
  addEventListener('resize', hide);
}
