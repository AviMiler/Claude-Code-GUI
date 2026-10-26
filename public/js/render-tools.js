/** Tool calls as compact, expandable rows: terminal for Bash, diffs for edits, a checklist for todos. */
import { h } from './dom.js';
import { icon } from './icons.js';

const shortPath = path => String(path || '').split(/[\\/]/).slice(-3).join('/');
const TOOLS = {
  Bash: { icon: 'terminal', verb: 'הרצת פקודה', target: input => input.command },
  PowerShell: { icon: 'terminal', verb: 'PowerShell', target: input => input.command },
  BashOutput: { icon: 'terminal', verb: 'פלט ברקע', target: input => input.bash_id },
  Read: { icon: 'eye', verb: 'קריאה', target: input => shortPath(input.file_path) },
  Write: { icon: 'file-plus', verb: 'כתיבה', target: input => shortPath(input.file_path) },
  Edit: { icon: 'pencil', verb: 'עריכה', target: input => shortPath(input.file_path) },
  MultiEdit: { icon: 'pencil', verb: 'עריכות', target: input => shortPath(input.file_path) },
  NotebookEdit: { icon: 'book', verb: 'עריכת מחברת', target: input => shortPath(input.notebook_path) },
  Grep: { icon: 'search', verb: 'חיפוש', target: input => `${input.pattern}${input.path ? `  ·  ${shortPath(input.path)}` : ''}` },
  Glob: { icon: 'search', verb: 'חיפוש קבצים', target: input => input.pattern },
  LS: { icon: 'folder', verb: 'רשימת קבצים', target: input => shortPath(input.path) },
  WebFetch: { icon: 'globe', verb: 'קריאת דף', target: input => input.url },
  WebSearch: { icon: 'globe', verb: 'חיפוש ברשת', target: input => input.query },
  Task: { icon: 'bot', verb: 'סוכן', target: input => [input.subagent_type, input.description].filter(Boolean).join(' · ') },
  Agent: { icon: 'bot', verb: 'סוכן', target: input => [input.subagent_type, input.description].filter(Boolean).join(' · ') },
  Skill: { icon: 'sparkles', verb: 'Skill', target: input => input.skill || input.command || input.name },
  SlashCommand: { icon: 'slash', verb: 'פקודה', target: input => input.command },
  AskUserQuestion: { icon: 'help', verb: 'שאלה', target: input => input.questions?.[0]?.question },
  ExitPlanMode: { icon: 'map', verb: 'תוכנית', target: () => 'בקשה לאשר תוכנית' },
  EnterPlanMode: { icon: 'map', verb: 'מצב תכנון', target: () => '' },
};

function metaFor(name, input) {
  if (TOOLS[name]) return TOOLS[name];
  const mcp = name.match(/^mcp__(.+?)__(.+)$/);
  if (mcp) return { icon: 'plug', verb: mcp[1], target: () => mcp[2] };
  const key = ['file_path', 'command', 'pattern', 'path', 'url', 'query', 'description', 'prompt'].find(k => typeof input?.[k] === 'string');
  return { icon: 'wrench', verb: name, target: () => (key ? input[key] : '') };
}

/** Line diff that keeps the shared head and tail as context. */
export function diffLines(oldText = '', newText = '') {
  const before = oldText.split('\n');
  const after = newText.split('\n');
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start
    && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const context = lines => lines.map(text => ({ type: 'ctx', text }));
  return [
    ...context(before.slice(Math.max(0, start - 2), start)),
    ...before.slice(start, before.length - end).map(text => ({ type: 'del', text })),
    ...after.slice(start, after.length - end).map(text => ({ type: 'add', text })),
    ...context(after.slice(after.length - end, after.length - end + 2)),
  ];
}

export function renderDiff(lines) {
  return h('div', { class: 'diff' }, lines.map(line => h('div', { class: `diff-line ${line.type}` },
    h('span', { class: 'sign' }, line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '), line.text)));
}

function editDiffs(name, input) {
  if (name === 'Edit') return [diffLines(input.old_string, input.new_string)];
  if (name === 'MultiEdit') return (input.edits || []).map(edit => diffLines(edit.old_string, edit.new_string));
  if (name === 'Write') return [String(input.content || '').split('\n').slice(0, 400).map(text => ({ type: 'add', text }))];
  return null;
}

function inputView(name, input) {
  if (name === 'Bash' || name === 'PowerShell') {
    return h('pre', { class: 'tool-pre terminal' }, h('span', { class: 'prompt' }, name === 'Bash' ? '$ ' : 'PS> '), input.command || '');
  }
  const diffs = editDiffs(name, input);
  if (diffs) return h('div', null, ...diffs.map(renderDiff));
  if (name === 'Task' || name === 'Agent') return h('pre', { class: 'tool-pre', dir: 'auto' }, input.prompt || '');
  return h('pre', { class: 'tool-pre' }, JSON.stringify(input, null, 2));
}

function renderTodos(item) {
  const todos = item.input?.todos || [];
  const done = todos.filter(todo => todo.status === 'completed').length;
  const iconFor = status => (status === 'completed' ? 'check-circle' : status === 'in_progress' ? 'circle-dot' : 'circle');
  return h('div', { class: 'todo-card latest', dataset: { toolId: item.id } },
    h('h4', null, icon('list-checks'), `משימות · ${done}/${todos.length}`),
    todos.map(todo => h('div', { class: `todo ${todo.status}`, dir: 'auto' }, icon(iconFor(todo.status)),
      h('span', null, todo.status === 'in_progress' ? todo.activeForm || todo.content : todo.content))));
}

/**
 * @param {{id:string, name:string, input:object}} item
 * @returns {HTMLElement}
 */
export function renderTool(item) {
  if (item.name === 'TodoWrite') return renderTodos(item);
  const input = item.input || {};
  const meta = metaFor(item.name, input);
  const summary = h('summary', null, icon(meta.icon, 'tool-icon'), h('span', { class: 'tool-verb' }, meta.verb),
    h('span', { class: 'tool-target', title: String(meta.target(input) || '') }, String(meta.target(input) || '')));
  const diffs = editDiffs(item.name, input);
  if (diffs && item.name !== 'Write') {
    const lines = diffs.flat();
    summary.append(h('span', { class: 'tool-stats' }, h('span', { class: 'add' }, `+${lines.filter(l => l.type === 'add').length}`),
      h('span', { class: 'del' }, `−${lines.filter(l => l.type === 'del').length}`)));
  }
  summary.append(icon('loader', 'tool-state'));
  const detail = h('div', { class: 'tool-detail' }, inputView(item.name, input));
  return h('details', { class: 'tool', dataset: { toolId: item.id, status: 'running', name: item.name } },
    summary, detail, h('div', { class: 'tool-children' }));
}

/** Attaches a tool result to its tool row (or shows it alone when the row is missing). */
export function attachToolResult(container, item) {
  const tool = container.querySelector(`[data-tool-id="${CSS.escape(item.toolUseId)}"]`);
  if (tool?.classList.contains('todo-card')) return;
  const output = h('pre', { class: `tool-pre${item.isError ? ' error' : ''}` }, item.text || '(ללא פלט)');
  if (!tool) return container.append(output);
  tool.dataset.status = item.isError ? 'error' : 'done';
  tool.querySelector('.tool-state')?.replaceWith(icon(item.isError ? 'x-circle' : 'check', 'tool-state'));
  const label = tool.dataset.name === 'Read' ? 'תוכן' : item.isError ? 'שגיאה' : 'תוצאה';
  tool.querySelector('.tool-detail').append(h('div', { class: 'tool-label' }, label), output);
}

/** Marks rows that never got a result (turn stopped or denied) as finished. */
export function settleTools(container) {
  for (const tool of container.querySelectorAll('.tool[data-status="running"]')) {
    tool.dataset.status = 'stopped';
    tool.querySelector('.tool-state')?.replaceWith(icon('circle', 'tool-state'));
  }
}
