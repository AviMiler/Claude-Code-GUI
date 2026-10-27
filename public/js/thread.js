/**
 * The conversation view of the active session: items, live streaming text, the "working" line (working-line.js)
 * and each turn's "files changed" card (turn-changes.js).
 */
import { copyText } from './dom.js';
import { icon } from './icons.js';
import { renderMarkdown, enableCodeCopy } from './markdown.js';
import { appendItem, renderAssistantText, renderThinking, copySourceOf } from './render-items.js';
import { settleTools } from './render-tools.js';
import { createWorkingLine } from './working-line.js';
import { turnChanges, renderTurnChanges } from './turn-changes.js';
import { countToolCalls } from './turn-stats.js';

const NEAR_BOTTOM_PX = 140;

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
 * @param {{scroller:HTMLElement, messages:HTMLElement, onOpenGit:()=>void}} elements onOpenGit: the git diff panel
 * @returns {{show:Function, append:Function, delta:Function, setRunning:Function, scrollToEnd:Function}}
 */
export function createThread({ scroller, messages, onOpenGit }) {
  let live = { text: null, thinking: null, textValue: '', thinkingValue: '' };
  let frame = 0;
  let heard = false; // anything from the CLI in this turn yet? (no: it is still starting up)
  let activeTool = null;
  let outcome = 'done';
  const working = createWorkingLine(() => ({ writing: Boolean(live.text), thinking: Boolean(live.thinking), tool: activeTool, heard }));
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
  const place = node => (working.node() ? messages.insertBefore(node, working.node()) : messages.append(node));
  function dropLive(kind) {
    live[kind]?.remove();
    live[kind] = null;
    live[`${kind}Value`] = '';
  }

  function setRunning(running, { startedAt = Date.now(), waiting = false } = {}) {
    if (!running) {
      working.finish(outcome);
      activeTool = null;
      dropLive('text');
      dropLive('thinking');
      settleTools(messages);
      return;
    }
    if (!working.node()) {
      heard = false;
      outcome = 'done';
    }
    const created = working.start({ startedAt, waiting });
    if (created) keepPinned(() => messages.append(created));
  }

  /** Something arrived from the CLI (init, item or token): it is no longer starting up. */
  function activity() {
    if (heard || !working.node()) return;
    heard = true;
    working.render();
  }

  /** Rendered items carry their index in session.items, so a search can find and highlight them (search-hits.js). */
  const tag = (node, index) => { if (node && index !== undefined) node.dataset.itemIndex = String(index); return node; };

  /** The turn's "files changed" card, right after its result item (turn-changes.js); null when nothing changed. */
  const changesCard = (items, index) => renderTurnChanges(turnChanges(items, index), { onOpenGit });
  /** A result's meta line counts its turn's tool calls (turn-stats.js). */
  const resultContext = (item, items, index) => (item.kind === 'result' && items ? { toolCalls: countToolCalls(items, index) } : undefined);

  /** @param {object} item @param {number} [index] position in session.items @param {object[]} [items] session.items */
  function append(item, index, items) {
    if (working.node() && item.kind !== 'user') heard = true;
    if (!item.parent && item.kind === 'tool') activeTool = item;
    else if (!item.parent && (item.kind === 'tool-result' || item.kind === 'text')) activeTool = null;
    if (item.kind === 'error' || (item.kind === 'result' && item.isError)) outcome = 'error';
    if (item.kind === 'notice' && item.stopped) outcome = 'stopped';
    keepPinned(() => {
      if (!item.parent && (item.kind === 'text' || item.kind === 'thinking')) dropLive(item.kind);
      // Thinking that streamed but arrives empty (redacted/summarized) never gets its own item; the next step ends it.
      if (!item.parent && (item.kind === 'text' || item.kind === 'tool')) dropLive('thinking');
      tag(appendItem(messages, item, resultContext(item, items, index)), index)?.classList.add('fresh'); // animates only what arrives live, not a re-rendered history
      const changes = item.kind === 'result' && items ? changesCard(items, index) : null;
      if (changes) messages.append(changes);
      // Live elements and the working line always stay after the newest item.
      [live.thinking, live.text, working.node()].filter(Boolean).forEach(node => messages.append(node));
    });
    working.render();
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
      working.render();
    });
  }

  /** Re-renders a whole session (on switch). */
  function show(session) {
    setRunning(false);
    messages.replaceChildren();
    (session?.items || []).forEach((item, index) => {
      tag(appendItem(messages, item, resultContext(item, session.items, index)), index);
      if (item.kind === 'result') { const changes = changesCard(session.items, index); if (changes) messages.append(changes); }
    });
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
