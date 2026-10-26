/** The message box: auto-growing text area, mode and model chips, context ring, send/stop, keyboard shortcuts. */
import { h } from './dom.js';
import { icon } from './icons.js';
import { modeInfo } from './modes.js';
import { attachComposerMenus } from './composer-menus.js';

const RING_LENGTH = 2 * Math.PI * 9;

function contextRing() {
  const svg = `<svg viewBox="0 0 24 24"><circle class="track" cx="12" cy="12" r="9" fill="none" stroke-width="3"/>`
    + `<circle class="fill" cx="12" cy="12" r="9" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 ${RING_LENGTH}"/></svg>`;
  return h('button', { type: 'button', class: 'context-ring', title: 'ניצול הקשר', html: svg, hidden: true });
}

/**
 * @param {HTMLElement} root Container (.composer-area).
 * @param {{onSubmit:(text:string)=>Promise<boolean>, onStop:()=>void, onCommand:(command:object)=>void,
 *   onModeMenu:(anchor:HTMLElement)=>void, onModelMenu:(anchor:HTMLElement)=>void, onPlusMenu:(anchor:HTMLElement)=>void,
 *   onContext:()=>void, onCycleMode:()=>void, getHistory:()=>string[]}} handlers
 */
export function createComposer(root, handlers) {
  const textarea = h('textarea', { rows: 1, dir: 'auto', 'aria-label': 'הודעה ל-Claude' });
  const plus = h('button', { type: 'button', class: 'round-button', title: 'הוספה: קבצים, פקודות, תיקיות' }, icon('plus'));
  const modeChip = h('button', { type: 'button', class: 'composer-chip', title: 'מצב הרשאות (Shift+Tab להחלפה)' });
  const modelChip = h('button', { type: 'button', class: 'composer-chip', title: 'מודל ומאמץ' });
  const ring = contextRing();
  const send = h('button', { type: 'submit', class: 'send-button', title: 'שליחה (Enter)' }, icon('arrow-up'));
  const form = h('form', { class: 'composer' }, textarea,
    h('div', { class: 'composer-bar' }, plus, modeChip, h('span', { class: 'grow' }), ring, modelChip, send));
  const hint = h('p', { class: 'composer-hint' }, h('kbd', null, '/'), ' פקודות · ', h('kbd', null, '@'), ' קבצים וסוכנים · ',
    h('kbd', null, 'Shift+Tab'), ' מצב הרשאות · ', h('kbd', null, 'Esc'), ' עצירה');
  root.append(form, hint);

  let running = false;
  let historyIndex = -1;
  const autosize = () => {
    textarea.style.height = 'auto';
    const max = innerHeight * 0.4;
    textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
    textarea.style.overflowY = textarea.scrollHeight > max ? 'auto' : 'hidden';
    send.disabled = !running && !textarea.value.trim();
  };
  // A command picked from the menu replaces what was typed to find it ("/sk" -> /skills).
  const menus = attachComposerMenus(textarea, form, {
    onCommand: command => { textarea.value = ''; autosize(); handlers.onCommand(command); },
    onChange: autosize,
  });

  async function submit() {
    const text = textarea.value.trim();
    if (!text || running) return;
    textarea.value = '';
    autosize();
    historyIndex = -1;
    const accepted = await handlers.onSubmit(text);
    if (!accepted && !textarea.value) { textarea.value = text; autosize(); }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (running) handlers.onStop();
    else submit();
  });
  textarea.addEventListener('input', autosize);
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
  modelChip.addEventListener('click', () => handlers.onModelMenu(modelChip));
  ring.addEventListener('click', () => handlers.onContext());
  autosize();

  return {
    textarea,
    focus: () => textarea.focus(),
    /** Puts text in the box (used by panels: "use this skill", "@agent"...). */
    insert(text, { replace = false } = {}) {
      textarea.value = replace ? text : `${textarea.value}${textarea.value && !textarea.value.endsWith(' ') ? ' ' : ''}${text}`;
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      autosize();
      menus.refresh();
    },
    update({ mode, modelLabel, isRunning, contextPercent, hasSession }) {
      running = isRunning;
      const info = modeInfo(mode);
      modeChip.className = `composer-chip mode-${info.value}`;
      modeChip.replaceChildren(icon(info.icon), h('span', { class: 'label' }, info.short), icon('chevron-down', 'chevron'));
      modelChip.replaceChildren(icon('cpu'), h('span', { class: 'label' }, modelLabel), icon('chevron-down', 'chevron'));
      send.classList.toggle('stop', running);
      send.title = running ? 'עצירה (Esc)' : 'שליחה (Enter)';
      send.replaceChildren(icon(running ? 'stop' : 'arrow-up'));
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
