/**
 * The message box: auto-growing text area, mode and model chips, context ring, send/stop, keyboard shortcuts,
 * the queue of messages typed while Claude works (sent one by one after the running turn),
 * and attachments (paste, drop on the box, or the + menu) shown above the text: images as thumbnails, other files as chips.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { modeInfo } from './modes.js';
import { attachComposerMenus } from './composer-menus.js';
import { prepareAttachment, checkRoom, formatSize } from './attachments.js';
import { toast } from './ui.js';

const RING_LENGTH = 2 * Math.PI * 9;

function contextRing() {
  const svg = `<svg viewBox="0 0 24 24"><circle class="track" cx="12" cy="12" r="9" fill="none" stroke-width="3"/>`
    + `<circle class="fill" cx="12" cy="12" r="9" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 ${RING_LENGTH}"/></svg>`;
  return h('button', { type: 'button', class: 'context-ring', title: 'ניצול הקשר', html: svg, hidden: true });
}

function queueList(queue, running, handlers) {
  const rows = queue.map((entry, index) => h('div', { class: 'queue-row' },
    h('span', { class: 'queue-index' }, String(index + 1)),
    h('span', { class: 'queue-text', dir: 'auto', title: entry.text },
      entry.images?.length ? h('span', { class: 'queue-images' }, icon('image'), String(entry.images.length)) : null,
      entry.files?.length ? h('span', { class: 'queue-images' }, icon('file'), String(entry.files.length)) : null, entry.text),
    h('button', { type: 'button', class: 'icon-button', title: 'עריכה (מחזיר לתיבת הכתיבה)', onClick: () => handlers.onQueueEdit(entry) }, icon('pencil')),
    h('button', { type: 'button', class: 'icon-button', title: 'הסרה מהתור', onClick: () => handlers.onQueueRemove(entry) }, icon('x'))));
  const head = h('div', { class: 'queue-head' }, icon('list'),
    h('span', null, running ? `בתור (${queue.length}) – יישלחו כש-Claude יסיים` : `בתור (${queue.length}) – התור עצר`),
    running ? null : h('button', { type: 'button', class: 'btn small primary', onClick: handlers.onQueueResume }, 'שליחת הבאה'));
  return [head, ...rows];
}

/**
 * @param {HTMLElement} root Container (.composer-area).
 * @param {{onSubmit:(text:string, images:object[])=>Promise<boolean>, onStop:()=>void, onCommand:(command:object)=>void,
 *   onModeMenu:(anchor:HTMLElement)=>void, onModelMenu:(anchor:HTMLElement)=>void, onPlusMenu:(anchor:HTMLElement)=>void,
 *   onContext:()=>void, onCycleMode:()=>void, getHistory:()=>string[],
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
    h('kbd', null, 'Enter'), ' בזמן עבודה – לתור');
  root.append(queueBox, form, hint);

  let running = false;
  let historyIndex = -1;
  let attachments = []; // { kind: 'image'|'file', data | ref, name, size, preview? } — see attachments.js
  const autosize = () => {
    textarea.style.height = 'auto';
    const max = innerHeight * 0.4;
    textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
    textarea.style.overflowY = textarea.scrollHeight > max ? 'auto' : 'hidden';
    const empty = !textarea.value.trim() && !attachments.length;
    send.disabled = empty;
    send.hidden = running && empty; // while Claude works, an empty box shows only the stop button
  };
  // A command picked from the menu replaces what was typed to find it ("/sk" -> /skills).
  const menus = attachComposerMenus(textarea, form, {
    onCommand: command => { textarea.value = ''; autosize(); handlers.onCommand(command); },
    onChange: autosize,
  });

  function drawAttachments() {
    strip.hidden = !attachments.length;
    strip.replaceChildren(...attachments.map(attachment => h('div', {
      class: `attachment ${attachment.kind}`, title: attachment.size ? `${attachment.name} · ${formatSize(attachment.size)}` : attachment.name,
    },
      attachment.kind === 'image' ? h('img', { src: attachment.preview, alt: attachment.name })
        : [icon('file'), h('span', { class: 'attachment-name', dir: 'auto' }, attachment.name)],
      h('button', { type: 'button', class: 'attachment-remove', title: 'הסרה', 'aria-label': `הסרת ${attachment.name}`,
        onClick: () => { attachments = attachments.filter(item => item !== attachment); drawAttachments(); textarea.focus(); } }, icon('x')))));
    autosize();
  }

  /** Adds files of any type; each is read (images shrunk if needed) before it shows. */
  async function attach(files) {
    for (const file of [...(files || [])]) {
      try {
        const attachment = await prepareAttachment(file);
        checkRoom(attachments, attachment);
        attachments = [...attachments, attachment];
        drawAttachments();
      } catch (error) {
        toast(error.message, 'error');
      }
    }
    if (attachments.length) handlers.onTyping?.();
  }

  // While a turn runs, the message is queued by the server and sent when the turn ends.
  async function submit() {
    const text = textarea.value.trim();
    if (!text && !attachments.length) return;
    const sent = attachments;
    textarea.value = '';
    attachments = [];
    drawAttachments();
    historyIndex = -1;
    const accepted = await handlers.onSubmit(text, sent);
    if (!accepted) {
      if (!textarea.value) textarea.value = text;
      attachments = [...sent, ...attachments];
      drawAttachments();
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    submit();
  });
  stop.addEventListener('click', () => handlers.onStop());
  picker.addEventListener('change', () => { attach(picker.files); picker.value = ''; });
  // Files on the clipboard (a screenshot, "copy image", files copied in Explorer) are attached; pasted text still goes into the box.
  textarea.addEventListener('paste', event => {
    const files = [...(event.clipboardData?.files || [])];
    if (!files.length) return;
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    attach(files);
  });
  form.addEventListener('dragover', event => {
    if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
    event.preventDefault();
    form.classList.add('dropping');
  });
  form.addEventListener('dragleave', event => { if (!form.contains(event.relatedTarget)) form.classList.remove('dropping'); });
  form.addEventListener('drop', event => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    form.classList.remove('dropping');
    attach(event.dataTransfer.files);
  });
  textarea.addEventListener('input', () => {
    autosize();
    if (textarea.value.trim()) handlers.onTyping?.(); // lets the CLI start while the message is written
  });
  textarea.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (menus.handleKey(event)) { event.preventDefault(); return; }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); return; }
    if (event.key === 'Tab' && event.shiftKey) { event.preventDefault(); handlers.onCycleMode(); return; }
    if (event.key === 'Escape' && running) { event.preventDefault(); handlers.onStop(); return; }
    const history = handlers.getHistory();
    if (event.key === 'ArrowUp' && (!textarea.value || historyIndex >= 0) && history.length) {
      event.preventDefault();
      historyIndex = Math.min(historyIndex + 1, history.length - 1);
      textarea.value = history[history.length - 1 - historyIndex];
      autosize();
    } else if (event.key === 'ArrowDown' && historyIndex >= 0) {
      event.preventDefault();
      historyIndex -= 1;
      textarea.value = historyIndex >= 0 ? history[history.length - 1 - historyIndex] : '';
      autosize();
    }
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
      attachments = [...entries.flatMap(entry => entry.attachments || []), ...attachments];
      drawAttachments();
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
      send.title = running ? 'הוספה לתור (Enter) – תישלח כש-Claude יסיים' : 'שליחה (Enter)';
      send.classList.toggle('queue-send', running);
      queueBox.hidden = !queue.length;
      queueBox.replaceChildren(...(queue.length ? queueList(queue, running, handlers) : []));
      textarea.placeholder = hasSession ? 'השב ל-Claude…' : 'במה נעבוד? תאר משימה כדי להתחיל סשן חדש…';
      ring.hidden = !(contextPercent >= 0);
      if (contextPercent >= 0) {
        ring.title = `ניצול הקשר: ${contextPercent}%`;
        ring.querySelector('.fill').setAttribute('stroke-dasharray', `${(RING_LENGTH * Math.min(contextPercent, 100)) / 100} ${RING_LENGTH}`);
      }
      autosize();
    },
  };
}
