/** Conversation items -> DOM. Item kinds come from lib/event-translator.js (plus local errors). */
import { h } from './dom.js';
import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { renderTool, attachToolResult } from './render-tools.js';

const LOOKS_LIKE_MARKDOWN = /(^|\n)(#{1,4} |\|.*\||[-*] |\*\*)/;

function renderUser(item) {
  const bubble = h('div', { class: 'bubble', dir: 'auto' });
  const slash = item.text.match(/^(\/[^\s]+)([\s\S]*)$/);
  if (slash) bubble.append(h('span', { class: 'slash' }, slash[1]), slash[2]);
  else bubble.textContent = item.text;
  return h('div', { class: 'msg-user' }, bubble);
}

export function renderAssistantText(text, live = false) {
  return h('div', { class: `msg-assistant markdown${live ? ' live' : ''}`, html: renderMarkdown(text) });
}

export function renderThinking(text, open = false) {
  return h('details', { class: 'thinking', open },
    h('summary', null, icon('bulb'), open ? 'חושב…' : 'חשיבה'), h('div', { class: 'thinking-body', dir: 'auto' }, text));
}

function renderResult(item) {
  if (item.isError) {
    return h('div', { class: 'turn-meta error' }, icon('x-circle'), `נכשל${item.text ? `: ${item.text}` : ` (${item.subtype})`}`);
  }
  const parts = [`${(item.durationMs / 1000).toFixed(1)} שנ׳`];
  if (item.turns > 1) parts.push(`${item.turns} סבבים`);
  if (item.usage) parts.push(`${item.usage.input + item.usage.output} טוקנים`);
  if (item.costUsd > 0) parts.push(`$${item.costUsd.toFixed(4)}`);
  return h('div', { class: 'turn-meta' }, icon('check'), parts.join(' · '));
}

function renderCommandOutput(item) {
  const body = LOOKS_LIKE_MARKDOWN.test(item.text)
    ? h('div', { class: 'markdown', html: renderMarkdown(item.text) })
    : h('pre', null, item.text);
  return h('div', { class: 'command-output' }, h('div', { class: 'head' }, icon('terminal'), 'פלט פקודה'), body);
}

function build(item) {
  switch (item.kind) {
    case 'user': return renderUser(item);
    case 'text': return renderAssistantText(item.text);
    case 'thinking': return renderThinking(item.text);
    case 'tool': return renderTool(item);
    case 'result': return renderResult(item);
    case 'command-output': return renderCommandOutput(item);
    case 'divider': return h('div', { class: 'divider' }, item.text);
    case 'error': return h('div', { class: 'error-card', dir: 'auto' }, icon('alert'), h('div', null, item.text));
    default: return h('div', { class: 'notice', dir: 'auto' }, icon(item.level === 'warning' ? 'alert' : 'info'), h('span', null, item.text));
  }
}

/**
 * Appends one item. Items of a subagent (item.parent) go inside the parent tool row.
 * @param {HTMLElement} container The messages element.
 * @param {{kind:string, parent?:string}} item
 */
export function appendItem(container, item) {
  if (item.kind === 'tool-result') return attachToolResult(container, item);
  const parentRow = item.parent && container.querySelector(`[data-tool-id="${CSS.escape(item.parent)}"] > .tool-children`);
  const target = parentRow || container;
  if (item.kind === 'tool' && item.name === 'TodoWrite') {
    container.querySelectorAll('.todo-card.latest').forEach(card => card.classList.remove('latest'));
  }
  target.append(build(item));
}

/** Plain-text Markdown export of a whole conversation (for /export). */
export function exportMarkdown(session) {
  const lines = [`# ${session.name}`, '', `תיקייה: \`${session.cwd}\``, ''];
  for (const item of session.items) {
    if (item.kind === 'user') lines.push('## 🧑 משתמש', '', item.text, '');
    else if (item.kind === 'text' && !item.parent) lines.push('## ✻ Claude', '', item.text, '');
    else if (item.kind === 'tool') lines.push(`> כלי: **${item.name}** \`${JSON.stringify(item.input).slice(0, 200)}\``, '');
    else if (item.kind === 'command-output') lines.push('```', item.text, '```', '');
    else if (item.kind === 'error') lines.push(`> ⚠️ ${item.text}`, '');
  }
  return lines.join('\n');
}
