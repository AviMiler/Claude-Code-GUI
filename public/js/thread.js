/** The conversation view of the active session: items, live streaming text, and the "working" line. */
import { h, copyText } from './dom.js';
import { icon } from './icons.js';
import { renderMarkdown, enableCodeCopy } from './markdown.js';
import { appendItem, renderAssistantText, renderThinking } from './render-items.js';
import { settleTools } from './render-tools.js';

const NEAR_BOTTOM_PX = 140;
const VERBS = ['חושב', 'מעבד', 'מתכנן', 'בודק', 'מנתח', 'מגבש', 'מהרהר', 'מבשל רעיון'];

/**
 * @param {{scroller:HTMLElement, messages:HTMLElement}} elements
 * @returns {{show:Function, append:Function, delta:Function, setRunning:Function, scrollToEnd:Function}}
 */
export function createThread({ scroller, messages }) {
  let live = { text: null, thinking: null, textValue: '', thinkingValue: '' };
  let working = null;
  let tick = null;
  let frame = 0;
  let status = { startedAt: 0, waiting: false };
  enableCodeCopy(messages, copyText);

  const isNearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_BOTTOM_PX;
  const scrollToEnd = () => { scroller.scrollTop = scroller.scrollHeight; };
  const keepPinned = action => {
    const stick = isNearBottom();
    action();
    if (stick) scrollToEnd();
  };
  /** New content goes above the working line so it always stays last. */
  const place = node => (working ? messages.insertBefore(node, working) : messages.append(node));
  function dropLive(kind) {
    live[kind]?.remove();
    live[kind] = null;
    live[`${kind}Value`] = '';
  }

  function renderWorking() {
    if (!working) return;
    const seconds = Math.floor((Date.now() - status.startedAt) / 1000);
    const verb = status.waiting ? 'ממתין לאישור שלך' : live.text ? 'כותב' : working.dataset.verb;
    working.querySelector('.verb').textContent = `${verb}…`;
    working.querySelector('.elapsed').textContent = `${seconds} שנ׳`;
  }

  function setRunning(running, { startedAt = Date.now(), waiting = false } = {}) {
    status = { startedAt, waiting };
    if (!running) {
      clearInterval(tick);
      working?.remove();
      working = null;
      dropLive('text');
      dropLive('thinking');
      settleTools(messages);
      return;
    }
    if (!working) {
      working = h('div', { class: 'working', dataset: { verb: VERBS[Math.floor(Math.random() * VERBS.length)] } },
        icon('spark', 'spinning'), h('span', { class: 'verb' }), h('span', { class: 'elapsed' }), h('kbd', null, 'Esc'));
      keepPinned(() => messages.append(working));
      clearInterval(tick);
      tick = setInterval(renderWorking, 1000);
    }
    renderWorking();
  }

  function append(item) {
    keepPinned(() => {
      if (!item.parent && (item.kind === 'text' || item.kind === 'thinking')) dropLive(item.kind);
      // Thinking that streamed but arrives empty (redacted/summarized) never gets its own item; the next step ends it.
      if (!item.parent && (item.kind === 'text' || item.kind === 'tool')) dropLive('thinking');
      appendItem(messages, item);
      // Live elements and the working line always stay after the newest item.
      [live.thinking, live.text, working].filter(Boolean).forEach(node => messages.append(node));
    });
  }

  /** Token streaming: one live element per kind, re-rendered at most once per frame. */
  function delta({ kind, text }) {
    live[`${kind}Value`] += text;
    if (!live[kind]) {
      live[kind] = kind === 'text' ? renderAssistantText('', true) : renderThinking('', true);
      keepPinned(() => place(live[kind]));
    }
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      keepPinned(() => {
        if (live.text) live.text.innerHTML = renderMarkdown(live.textValue);
        if (live.thinking) live.thinking.querySelector('.thinking-body').textContent = live.thinkingValue;
      });
      renderWorking();
    });
  }

  /** Re-renders a whole session (on switch). */
  function show(session) {
    setRunning(false);
    messages.replaceChildren();
    for (const item of session?.items || []) appendItem(messages, item);
    if (session?.status === 'running') {
      setRunning(true, { startedAt: session.turnStartedAt || Date.now(), waiting: Boolean(session.pendingPermissions?.length) });
    }
    else settleTools(messages);
    requestAnimationFrame(scrollToEnd);
  }

  return { show, append, delta, setRunning, scrollToEnd, element: messages };
}
