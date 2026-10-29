/** /tasks: background tasks of the session (shell commands, subagents, Monitor) — live status, output tail, stop. */
import { h, timeAgo, formatTokens } from '../dom.js';
import { section, row, list, empty, badge, button } from './kit.js';
import { TASKS_EVENT } from '../events.js';
import { STATUS, TYPE_LABELS, duration } from '../tasks/task-format.js';
import { readTaskOutput, stopTask } from '../tasks/task-actions.js';

/**
 * @param {HTMLElement} body
 * @param {{session:object|null, liveSession:()=>object|null, scope:object, api:object, toast:(message:string, type?:string)=>void}} context
 */
export function renderTasksPanel(body, context) {
  if (!context.session) return body.append(empty('משימות רקע שייכות לסשן. פתח סשן כדי לראות אותן.'));
  const sessionId = context.session.id;
  const open = new Set(); // task ids whose output is shown
  const outputs = new Map(); // task id -> output node (kept across redraws)
  const holder = h('div');

  const control = (subtype, payload) => context.api.control(context.scope, subtype, payload);

  async function loadOutput(task) {
    const node = outputs.get(task.id) || h('pre', { class: 'output-pre', dir: 'ltr' });
    outputs.set(task.id, node);
    node.textContent = 'טוען…';
    node.textContent = await readTaskOutput(control, task);
  }

  function taskRow(task) {
    const [label, tone] = STATUS[task.status] || [task.status, ''];
    const facts = [`התחיל ${timeAgo(task.startedAt)}`, duration(task),
      task.usage?.tokens ? `${formatTokens(task.usage.tokens)} טוקנים` : null,
      task.usage?.toolUses ? `${task.usage.toolUses} קריאות כלים` : null,
      task.lastTool && task.status === 'running' ? `כלי אחרון: ${task.lastTool}` : null].filter(Boolean).join(' · ');
    const toggleOutput = () => {
      if (open.delete(task.id)) return draw();
      open.add(task.id);
      draw();
      return loadOutput(task);
    };
    return row({
      title: h('span', { dir: 'auto' }, task.description || task.agent || task.id),
      badges: [badge(label, tone), TYPE_LABELS[task.type] ? badge(TYPE_LABELS[task.type]) : null, task.agent ? badge(task.agent) : null].filter(Boolean),
      sub: h('span', null, facts, task.summary ? h('div', { dir: 'auto' }, task.summary) : null),
      actions: [
        button(open.has(task.id) ? 'הסתרת פלט' : 'פלט', toggleOutput, { iconName: 'terminal' }),
        open.has(task.id) ? button('רענון', () => loadOutput(task), { iconName: 'refresh', title: 'קריאה מחדש של סוף הפלט' }) : null,
        task.status === 'running' ? button('עצירה', () => stopTask(control, task, context.toast), { variant: 'danger', iconName: 'stop' }) : null,
      ].filter(Boolean),
      details: open.has(task.id) ? outputs.get(task.id) : null,
    });
  }

  function draw() {
    const tasks = context.liveSession()?.id === sessionId ? context.liveSession().tasks || [] : [];
    const running = tasks.filter(task => task.status === 'running').length;
    holder.replaceChildren(
      h('p', { class: 'lead' }, running ? `${running} רצות עכשיו · ` : '', `${tasks.length} בסך הכול בסשן הזה (עד ש-Claude Code נסגר).`),
      tasks.length ? list(tasks.map(taskRow)) : empty('אין משימות רקע. כש-Claude מריץ פקודה ארוכה ברקע או סוכן משנה, היא תופיע כאן.'));
  }

  // Redraw on task events while this panel is on screen; stop listening once it is gone.
  const onTasks = event => {
    if (!holder.isConnected) return window.removeEventListener(TASKS_EVENT, onTasks);
    if (event.detail.sessionId === sessionId) draw();
    return undefined;
  };
  window.addEventListener(TASKS_EVENT, onTasks);
  draw();
  body.append(section('משימות רקע', 'פקודות וסוכנים ש-Claude הריץ ברקע. כל עוד משימה רצה, Claude Code לא נסגר מחוסר פעילות. '
    + '"פלט" מציג את סוף מה שהפקודה כתבה (עד 8KB).', holder));
  return undefined;
}
