/**
 * The message box: auto-growing text area, mode and model chips, context ring (context-ring.js), send/stop, keyboard
 * shortcuts, the queue (composer-queue.js) and attachments (composer-attachments.js). While Claude works, Enter sends a
 * correction into the running turn and Alt+Enter puts the message in the queue for after it.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { modeInfo } from './modes.js';
import { attachComposerMenus } from './composer-menus.js';
import { queueList, sendTitle } from './composer-queue.js';
import { contextRing, drawContextRing } from './context-ring.js';
import { createHistory } from './composer-history.js';
import { createAttachments } from './composer-attachments.js';

/**
 * @param {HTMLElement} root Container (.composer-area).
 * @param {{onSubmit:(text:string, attachments:object[], options:{delivery?:'correct'|'queue'})=>Promise<boolean>, onStop:()=>void,
 *   onCommand:(command:object)=>void, onModeMenu:(anchor:HTMLElement)=>void, onModelMenu:(anchor:HTMLElement)=>void,
 *   onPlusMenu:(anchor:HTMLElement)=>void, onContext:()=>void, onCycleMode:()=>void, getHistory:()=>string[],
 *   onQueueRemove:(entry:object)=>void, onQueueEdit:(entry:object)=>void, onQueueResume:()=>void, onTyping?:()=>void}} handlers
 */
export function createComposer(root, handlers) {
  const textarea = h('textarea', { rows: 1, dir: 'auto', 'aria-label': 'הודעה ל-Claude' });
  const plus = h('button', { type: 'button', class: 'round-button', title: 'הוספה: קבצים, פקודות, תיקיות' }, icon('plus'));
  const modeChip = h('button', { type: 'button', class: 'composer-chip', title: 'מצב הרשאות (Shift+Tab להחלפה)' });
  const modelChip = h('button', { type: 'button', class: 'composer-chip', title: 'מודל ומאמץ' });
  const ring = contextRing();
  const send = h('button', { type: 'submit', class: 'send-button', title: 'שליחה (Enter)' }, icon('arrow-up'));
  const stop = h('button', { type: 'button', class: 'send-button stop', title: 'עצירה (Esc)', hidden: true }, icon('stop'));
  const queueBox = h('div', { class: 'queue', hidden: true, 'aria-live': 'polite' });
  const strip = h('div', { class: 'attachments', hidden: true });
  const picker = h('input', { type: 'file', multiple: true, hidden: true });
  const form = h('form', { class: 'composer' }, strip, picker, textarea,
    h('div', { class: 'composer-bar' }, plus, modeChip, h('span', { class: 'grow' }), ring, modelChip, stop, send));
  const hint = h('p', { class: 'composer-hint' }, h('kbd', null, '/'), ' פקודות ו-Skills · ', h('kbd', null, '@'), ' קבצים וסוכנים · ',
    h('kbd', null, 'Shift+Tab'), ' מצב הרשאות · ', h('kbd', null, 'Ctrl+V'), ' קבצים ותמונות · ', h('kbd', null, 'Esc'), ' עצירה · ',
    h('kbd', null, 'Enter'), ' בזמן עבודה – תיקון מיידי · ', h('kbd', null, 'Alt+Enter'), ' – לתור');
  root.append(queueBox, form, hint);

  let running = false;
  const autosize = () => {
    textarea.style.height = 'auto';
    const max = innerHeight * 0.4;
    textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
    textarea.style.overflowY = textarea.scrollHeight > max ? 'auto' : 'hidden';
    const empty = !textarea.value.trim() && !files.get().length;
    send.disabled = empty;
    send.hidden = running && empty; // while Claude works, an empty box shows only the stop button
  };
  const files = createAttachments({ form, strip, textarea, onChange: autosize, onTyping: handlers.onTyping });
  const history = createHistory(textarea, handlers.getHistory, autosize);
  // A command picked from the menu replaces what was typed to find it ("/sk" -> /skills).
  const menus = attachComposerMenus(textarea, form, {
    onCommand: command => { textarea.value = ''; autosize(); handlers.onCommand(command); },
    onChange: autosize,
  });

  /** @param {'correct'|'queue'} delivery what a message does while Claude works (into the turn, or after it) */
  async function submit(delivery) {
    const text = textarea.value.trim();
    if (!text && !files.get().length) return;
    const sent = files.get();
    textarea.value = '';
    files.set([]);
    history.reset();
    const accepted = await handlers.onSubmit(text, sent, { delivery: running ? delivery : undefined });
    if (!accepted) {
      if (!textarea.value) textarea.value = text;
      files.set([...sent, ...files.get()]);
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    submit('correct');
  });
  stop.addEventListener('click', () => handlers.onStop());
  picker.addEventListener('change', () => { files.add(picker.files); picker.value = ''; });
  textarea.addEventListener('input', () => {
    autosize();
    if (textarea.value.trim()) handlers.onTyping?.(); // lets the CLI start while the message is written
  });
  textarea.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (menus.handleKey(event)) { event.preventDefault(); return; }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(event.altKey ? 'queue' : 'correct'); return; }
    if (event.key === 'Tab' && event.shiftKey) { event.preventDefault(); handlers.onCycleMode(); return; }
    if (event.key === 'Escape' && running) { event.preventDefault(); handlers.onStop(); return; }
    history.handleKey(event);
  });
  plus.addEventListener('click', () => handlers.onPlusMenu(plus));
  modeChip.addEventListener('click', () => handlers.onModeMenu(modeChip));
  let modelSwitchable = true;
  modelChip.addEventListener('click', () => { if (modelSwitchable) handlers.onModelMenu(modelChip); });
  ring.addEventListener('click', () => handlers.onContext());
  autosize();

  return {
    textarea,
    focus: () => textarea.focus(),
    /** Opens the file picker (the + menu): files of any type. */
    pickFiles: () => picker.click(),
    /** Puts text in the box (used by panels: "use this skill", "@agent"...). */
    insert(text, { replace = false } = {}) {
      textarea.value = replace ? text : `${textarea.value}${textarea.value && !textarea.value.endsWith(' ') ? ' ' : ''}${text}`;
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      autosize();
      menus.refresh();
    },
    /**
     * Puts messages back in the box (taken off the queue), before anything already typed; their images come back
     * as attachments that are sent again by reference.
     * @param {{text:string, attachments:object[]}[]} entries attachments come from fromStored (attachments.js)
     */
    restore(entries) {
      textarea.value = [...entries.map(entry => entry.text), textarea.value.trim()].filter(Boolean).join('\n\n');
      files.set([...entries.flatMap(entry => entry.attachments || []), ...files.get()]);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      autosize();
    },
    /** modelSwitchable=false: the system has one model, so the chip is a plain label instead of a menu. */
    update({ mode, modelLabel, modelSwitchable: switchable = true, isRunning, contextPercent, hasSession, queue = [] }) {
      running = isRunning;
      const info = modeInfo(mode);
      modeChip.className = `composer-chip mode-${info.value}`;
      modeChip.replaceChildren(icon(info.icon), h('span', { class: 'label' }, info.short), icon('chevron-down', 'chevron'));
      modelSwitchable = switchable;
      modelChip.classList.toggle('static', !switchable);
      modelChip.title = switchable ? 'מודל ומאמץ' : `${modelLabel} – המודל היחיד שזמין במערכת`;
      modelChip.replaceChildren(...[icon('cpu'), h('span', { class: 'label' }, modelLabel), switchable && icon('chevron-down', 'chevron')].filter(Boolean));
      stop.hidden = !running;
      send.title = sendTitle(running);
      send.classList.toggle('queue-send', running);
      queueBox.hidden = !queue.length;
      queueBox.replaceChildren(...(queue.length ? queueList(queue, running, handlers) : []));
      textarea.placeholder = hasSession ? 'השב ל-Claude…' : 'במה נעבוד? תאר משימה כדי להתחיל סשן חדש…';
      drawContextRing(ring, contextPercent);
      autosize();
    },
  };
}
