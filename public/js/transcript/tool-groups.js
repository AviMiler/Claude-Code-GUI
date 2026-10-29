/**
 * Normal and Thinking view modes: a run of top-level tool calls collapses into one summary line ("3 כלים: קריאה ×2,
 * עריכה") that opens to the individual rows. The rows keep their nodes, ids and listeners; only a wrapper is added.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { toolMeta } from '../render-tools.js';

const isTool = node => node.matches?.('details.tool');
const isGroup = node => node.matches?.('details.tool-group');
// Hidden in this mode, so it does not split a run of tools (thinking in Normal; empty text never exists as a node).
const isSkippable = (node, mode) => mode === 'normal' && node.matches?.('details.thinking');

/** Summary of a group: how many calls, which verbs, and whether any still runs or failed. */
function summarize(group) {
  const tools = [...group.querySelectorAll(':scope > .tool-group-rows > details.tool')];
  const verbs = new Map();
  for (const tool of tools) {
    const verb = toolMeta(tool.dataset.name, {}).verb;
    verbs.set(verb, (verbs.get(verb) || 0) + 1);
  }
  const running = tools.some(tool => tool.dataset.status === 'running');
  const failed = tools.some(tool => tool.dataset.status === 'error');
  const list = [...verbs].map(([verb, count]) => (count > 1 ? `${verb} ×${count}` : verb)).join(', ');
  group.querySelector(':scope > summary').replaceChildren(icon('wrench', 'tool-icon'),
    h('span', { class: 'tool-verb' }, `${tools.length} כלים`), h('span', { class: 'tool-target' }, list),
    failed ? icon('x-circle', 'tool-state error') : running ? icon('loader', 'tool-state spinning') : icon('check', 'tool-state'));
}

function wrap(nodes) {
  const rows = h('div', { class: 'tool-group-rows' });
  const group = h('details', { class: 'tool-group' }, h('summary'), rows);
  nodes[0].before(group);
  rows.append(...nodes);
  summarize(group);
  return group;
}

/** Takes every group apart (before a mode change or a full regroup). */
function ungroupAll(messages) {
  for (const group of messages.querySelectorAll(':scope > details.tool-group')) {
    group.replaceWith(...group.querySelector(':scope > .tool-group-rows').childNodes);
  }
}

/**
 * Groups runs of two or more top-level tool rows. Verbose: no groups.
 * @param {HTMLElement} messages @param {'normal'|'thinking'|'verbose'} mode
 */
export function groupAll(messages, mode) {
  ungroupAll(messages);
  if (mode === 'verbose') return;
  let run = [];
  const flush = () => { if (run.filter(isTool).length > 1) wrap(run); run = []; };
  for (const node of [...messages.children]) {
    if (isTool(node) || (run.length && isSkippable(node, mode))) run.push(node);
    else flush();
  }
  flush();
}

/**
 * A node was just added at the end: extends the group before it, or groups it with the tool row before it.
 * @param {HTMLElement} messages @param {HTMLElement} node @param {'normal'|'thinking'|'verbose'} mode
 */
export function groupAppended(messages, node, mode) {
  if (mode === 'verbose' || !isTool(node) || node.parentElement !== messages) return;
  const before = [];
  let previous = node.previousElementSibling;
  while (previous && isSkippable(previous, mode)) { before.unshift(previous); previous = previous.previousElementSibling; }
  if (previous && isGroup(previous)) {
    previous.querySelector(':scope > .tool-group-rows').append(...before, node);
    summarize(previous);
  } else if (previous && isTool(previous)) {
    wrap([previous, ...before, node]);
  }
}

/** Tool rows changed status together (the turn ended and running rows were settled): every summary is redone. */
export function refreshAllGroups(messages) {
  messages.querySelectorAll(':scope > details.tool-group').forEach(summarize);
}

/** A tool row's status changed (its result arrived): its group's summary shows it. */
export function refreshGroupOf(node) {
  const group = node?.closest?.('details.tool-group');
  if (group) summarize(group);
}
