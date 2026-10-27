/** /tasks: background tasks of the session (shell commands, subagents, Monitor) — live status, output tail, stop. */
import { h, timeAgo, formatTokens } from '../dom.js';
import { section, row, list, empty, badge, button, isUnsupported } from './kit.js';
import { TASKS_EVENT } from '../events.js';

const STATUS = {
  running: ['רץ', 'info'], completed: ['הסתיים', 'success'], failed: ['נכשל', 'danger'], stopped: ['נעצר', 'warning'], killed: ['נעצר', 'warning'],
};
const TYPE_LABELS = { local_bash: 'פקודה', local_agent: 'סוכן משנה', remote_agent: 'סוכן מרוחק', monitor: 'Monitor', local_workflow: 'תהליך' };

function duration(task) {
  const ms = task.usage?.durationMs ?? ((task.endedAt || Date.now()) - task.startedAt);
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} שנ׳` : `${Math.floor(seconds / 60)} דק׳ ${seconds % 60} שנ׳`;
}

/** The CLI returns the output tail; its exact field name is not documented, so read the likely ones. */
function outputText(response) {
  if (typeof response === 'string') return response;
  const text = response?.output ?? response?.content ?? response?.text ?? response?.tail;
  return typeof text === 'string' ? text : JSON.stringify(response, null, 2);
}

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

  async function loadOutput(task) {
    const node = outputs.get(task.id) || h('pre', { class: 'output-pre', dir: 'ltr' });
    outputs.set(task.id, node);
    node.textContent = 'טוען…';
    try {
      node.textContent = outputText(await context.api.control(context.scope, 'get_task_output', { task_id: task.id })) || '(אין פלט)';
    } catch (error) {
      node.textContent = isUnsupported(error) || /refused|not a shell|unknown task/i.test(error.message)
        ? 'הפלט זמין רק לפקודות ול-Monitor, ורק בגרסאות Claude Code שתומכות בכך.' : error.message;
    }
  }

  async function stop(task) {
    try {
      await context.api.control(context.scope, 'stop_task', { task_id: task.id });
      context.toast('נשלחה בקשת עצירה');
    } catch (error) {
      context.toast(isUnsupported(error) ? 'עצירת משימה לא זמינה בגרסת Claude Code המותקנת.' : error.message, 'error');
    }
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
        task.status === 'running' ? button('עצירה', () => stop(task), { variant: 'danger', iconName: 'stop' }) : null,
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
