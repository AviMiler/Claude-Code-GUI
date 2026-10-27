/**
 * The conversation view of the active session: items, live streaming text, and the "working" line.
 * The working line's crab shows what Claude is doing (data-state, animated in css/animations.css):
 * starting (the CLI is starting up) · thinking · writing · tool · waiting (for the user's approval),
 * and a short "done" / "error" moment when the turn ends.
 */
import { h, copyText } from './dom.js';
import { icon } from './icons.js';
import { crab, setCrabState } from './crab.js';
import { renderMarkdown, enableCodeCopy } from './markdown.js';
import { appendItem, renderAssistantText, renderThinking, copySourceOf } from './render-items.js';
import { settleTools, toolMeta } from './render-tools.js';

const NEAR_BOTTOM_PX = 140;
const VERBS = ['חושב', 'מעבד', 'מתכנן', 'בודק', 'מנתח', 'מגבש', 'מהרהר', 'מבשל רעיון'];
const END_MOMENT_MS = 2200;

/** Plays a CSS animation class again from its start. */
function restartAnimation(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

/** The tool a running turn is in (top level only), from its items: the last tool call without a result yet. */
function openTool(items) {
  let tool = null;
  for (const item of items) {
    if (item.parent) continue;
    if (item.kind === 'tool') tool = item;
    else if (item.kind === 'tool-result' || item.kind === 'text') tool = null;
  }
  return tool;
}

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
  let heard = false; // anything from the CLI in this turn yet? (no: it is still starting up)
  let activeTool = null;
  let outcome = 'done';
  enableCodeCopy(messages, copyText);
  messages.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-message]');
    const text = button && copySourceOf(button);
    if (text === null || text === undefined) return;
    await copyText(text);
    button.replaceChildren(icon('check')); // icon-only button: a check mark says it was copied
    button.title = 'הועתק';
    setTimeout(() => { button.replaceChildren(icon('copy')); button.title = 'העתקה'; }, 1400);
  });

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

  function currentState() {
    if (status.waiting) return { state: 'waiting', verb: 'ממתין לאישור שלך' };
    if (live.text) return { state: 'writing', verb: 'כותב' };
    if (live.thinking) return { state: 'thinking', verb: 'חושב' };
    if (activeTool) {
      const meta = toolMeta(activeTool.name, activeTool.input || {});
      const target = String(meta.target(activeTool.input || {}) || '').split('\n')[0];
      return { state: 'tool', verb: target ? `${meta.verb} · ${target.length > 48 ? `${target.slice(0, 48)}…` : target}` : meta.verb };
    }
    if (!heard) return { state: 'starting', verb: 'מעיר את Claude Code' };
    return { state: 'thinking', verb: working.dataset.verb };
  }

  function renderWorking() {
    if (!working) return;
    const seconds = Math.floor((Date.now() - status.startedAt) / 1000);
    const { state, verb } = currentState();
    const verbNode = working.querySelector('.verb');
    if (working.dataset.state !== state) restartAnimation(verbNode, 'swap'); // the text slides in with the crab's new move
    working.dataset.state = state;
    setCrabState(working.querySelector('.crab'), state);
    verbNode.textContent = `${verb}…`;
    working.querySelector('.elapsed').textContent = `${seconds} שנ׳`;
  }

  function setRunning(running, { startedAt = Date.now(), waiting = false } = {}) {
    status = { startedAt, waiting };
    if (!running) {
      clearInterval(tick);
      if (working) endMoment(working);
      working = null;
      activeTool = null;
      dropLive('text');
      dropLive('thinking');
      settleTools(messages);
      return;
    }
    if (!working) {
      heard = false;
      outcome = 'done';
      working = h('div', { class: 'working', dataset: { verb: VERBS[Math.floor(Math.random() * VERBS.length)], state: 'starting' } },
        crab(), h('span', { class: 'verb' }), h('span', { class: 'elapsed' }), h('kbd', null, 'Esc'));
      keepPinned(() => messages.append(working));
      clearInterval(tick);
      tick = setInterval(renderWorking, 1000);
    }
    renderWorking();
  }

  /** The crab stays a moment after the turn: a happy move when it finished, a scare when it failed. */
  function endMoment(node) {
    restartAnimation(node.querySelector('.verb'), 'swap');
    node.dataset.state = outcome;
    setCrabState(node.querySelector('.crab'), outcome);
    node.querySelector('.verb').textContent = { error: 'משהו השתבש', stopped: 'נעצר' }[outcome] || 'סיים';
    node.querySelector('kbd')?.remove();
    node.classList.add('ending');
    setTimeout(() => node.remove(), END_MOMENT_MS);
  }

  /** Something arrived from the CLI (init, item or token): it is no longer starting up. */
  function activity() {
    if (heard || !working) return;
    heard = true;
    renderWorking();
  }

  function append(item) {
    if (working && item.kind !== 'user') heard = true;
    if (!item.parent && item.kind === 'tool') activeTool = item;
    else if (!item.parent && (item.kind === 'tool-result' || item.kind === 'text')) activeTool = null;
    if (item.kind === 'error' || (item.kind === 'result' && item.isError)) outcome = 'error';
    if (item.kind === 'notice' && item.stopped) outcome = 'stopped';
    keepPinned(() => {
      if (!item.parent && (item.kind === 'text' || item.kind === 'thinking')) dropLive(item.kind);
      // Thinking that streamed but arrives empty (redacted/summarized) never gets its own item; the next step ends it.
      if (!item.parent && (item.kind === 'text' || item.kind === 'tool')) dropLive('thinking');
      const node = appendItem(messages, item);
      node?.classList.add('fresh'); // animates only what arrives live, not a re-rendered history
      // Live elements and the working line always stay after the newest item. The new item moves above them rather than
      // them below it: moving the working line would restart the crab's animation on every item.
      const firstLive = [...messages.children].find(child => child === live.thinking || child === live.text || child === working);
      if (node?.parentNode === messages && firstLive) messages.insertBefore(node, firstLive);
    });
    renderWorking();
  }

  /** Token streaming: one live element per kind, re-rendered at most once per frame. */
  function delta({ kind, text }) {
    heard = true;
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
      activeTool = openTool(session.items);
      setRunning(true, { startedAt: session.turnStartedAt || Date.now(), waiting: Boolean(session.pendingPermissions?.length) });
      activity(); // a turn already under way is past its start (the init event is not kept)
    }
    else settleTools(messages);
    requestAnimationFrame(scrollToEnd);
  }

  return { show, append, delta, setRunning, activity, scrollToEnd, element: messages };
}
