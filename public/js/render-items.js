/** Conversation items -> DOM. Item kinds come from lib/event-translator.js (plus local errors). */
import { h } from './dom.js';
import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { renderTool, attachToolResult } from './render-tools.js';
import { turnStats } from './turn-stats.js';
import { imageUrl, fileUrl, formatSize } from './attachments.js';

const LOOKS_LIKE_MARKDOWN = /(^|\n)(#{1,4} |\|.*\||[-*] |\*\*)/;
const copySources = new WeakMap(); // copy button -> the message's original text (Markdown for Claude's answers)

/** "Copy" under a message (shown on hover); the thread's click handler copies copySourceOf(button). */
function copyButton(text) {
  const button = h('button', { type: 'button', class: 'icon-button', title: 'העתקה', 'aria-label': 'העתקת ההודעה', dataset: { copyMessage: '' } }, icon('copy'));
  copySources.set(button, text);
  return h('div', { class: 'msg-actions' }, button);
}

/** Text a message copy button stands for (null for any other element). */
export const copySourceOf = button => copySources.get(button) ?? null;

/** Thumbnails of the images sent with a message; a click opens the full image in a new tab. */
function messageImages(images) {
  return h('div', { class: 'msg-images' }, images.map(image => h('a', { href: imageUrl(image), target: '_blank', rel: 'noopener', title: image.name },
    h('img', { src: imageUrl(image), alt: image.name, loading: 'lazy' }))));
}

/** Files sent with a message: name and size; a click downloads the stored copy. */
function messageFiles(files) {
  return h('div', { class: 'msg-files' }, files.map(file => h('a', { class: 'msg-file', href: fileUrl(file), download: file.name, title: file.path },
    icon('file'), h('span', { dir: 'auto' }, file.name), h('small', null, formatSize(file.size)))));
}

function renderUser(item) {
  const images = item.images?.length ? messageImages(item.images) : null;
  const files = item.files?.length ? messageFiles(item.files) : null;
  const bubble = item.text ? h('div', { class: 'bubble', dir: 'auto' }) : null;
  const slash = item.text.match(/^(\/[^\s]+)([\s\S]*)$/);
  if (slash && !images) bubble.append(h('span', { class: 'slash' }, slash[1]), slash[2]);
  else if (bubble) bubble.textContent = item.text;
  return h('div', { class: 'msg-user' }, images, files, bubble, item.text ? copyButton(item.text) : null);
}

export function renderAssistantText(text, live = false) {
  return h('div', { class: `msg-assistant markdown${live ? ' live' : ''}`, html: renderMarkdown(text) });
}

export function renderThinking(text, open = false) {
  return h('details', { class: 'thinking', open },
    h('summary', null, icon('bulb'), open ? 'חושב…' : 'חשיבה'), h('div', { class: 'thinking-body', dir: 'auto' }, text));
}

/** Claude's answer and its copy button; the button sits outside the Markdown so live re-renders never touch it. */
function withCopy(node, text) {
  return h('div', { class: 'msg-assistant-wrap' }, node, copyButton(text));
}

/** @param {object} item @param {number|null} toolCalls tool calls of the turn (turn-stats.js), null when unknown */
function renderResult(item, toolCalls = null) {
  if (item.isError) {
    return h('div', { class: 'turn-meta error' }, icon('x-circle'), `נכשל${item.text ? `: ${item.text}` : ` (${item.subtype})`}`);
  }
  const { text, details } = turnStats(item, toolCalls);
  return h('div', { class: 'turn-meta', title: details }, icon('check'), text);
}

function renderCommandOutput(item) {
  const body = LOOKS_LIKE_MARKDOWN.test(item.text)
    ? h('div', { class: 'markdown', html: renderMarkdown(item.text) })
    : h('pre', null, item.text);
  return h('div', { class: 'command-output' }, h('div', { class: 'head' }, icon('terminal'), 'פלט פקודה'), body);
}

function build(item, context) {
  switch (item.kind) {
    case 'user': return renderUser(item);
    case 'text': return item.parent ? renderAssistantText(item.text) : withCopy(renderAssistantText(item.text), item.text);
    case 'thinking': return renderThinking(item.text);
    case 'tool': return renderTool(item);
    case 'result': return renderResult(item, context?.toolCalls ?? null);
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
 * @param {{toolCalls?:number}} [context] facts from the rest of the conversation (a result's tool-call count)
 * @returns {HTMLElement|null} the new element (null for a tool result, which goes into its tool row)
 */
export function appendItem(container, item, context) {
  if (item.kind === 'tool-result') { attachToolResult(container, item); return null; }
  const parentRow = item.parent && container.querySelector(`[data-tool-id="${CSS.escape(item.parent)}"] > .tool-children`);
  const target = parentRow || container;
  if (item.kind === 'tool' && item.name === 'TodoWrite') {
    container.querySelectorAll('.todo-card.latest').forEach(card => card.classList.remove('latest'));
  }
  const node = build(item, context);
  target.append(node);
  return node;
}

/** Plain-text Markdown export of a whole conversation (for /export). */
export function exportMarkdown(session) {
  const lines = [`# ${session.name}`, '', `תיקייה: \`${session.cwd}\``, ''];
  for (const item of session.items) {
    if (item.kind === 'user') {
      lines.push('## 🧑 משתמש', '', ...(item.images || []).map(image => `[תמונה: ${image.name}]`),
        ...(item.files || []).map(file => `[קובץ: ${file.name}]`), item.text, '');
    }
    else if (item.kind === 'text' && !item.parent) lines.push('## ✻ Claude', '', item.text, '');
    else if (item.kind === 'tool') lines.push(`> כלי: **${item.name}** \`${JSON.stringify(item.input).slice(0, 200)}\``, '');
    else if (item.kind === 'command-output') lines.push('```', item.text, '```', '');
    else if (item.kind === 'error') lines.push(`> ⚠️ ${item.text}`, '');
  }
  return lines.join('\n');
}
