/**
 * "מתוזמנות": local scheduled tasks (lib/schedule/). The list (schedule in words, next run, last outcome, active switch,
 * run now, edit, delete), the form (schedule-form.js) and a task's run history (schedule-history.js). The list
 * refreshes itself every few seconds while it shows and no form is open.
 */
import { h } from '../dom.js';
import { section, row, list, empty, button, badge, load } from '../panels/kit.js';
import { scheduleForm } from './schedule-form.js';
import { showHistory } from './schedule-history.js';
import { runBadges, formatTime } from './schedule-labels.js';

const REFRESH_MS = 5000;

/** @param {HTMLElement} body @param {object} context the panel context (actions.js panelContext) */
export function renderSchedulePanel(body, context) {
  const { api, toast } = context;
  const formHolder = h('div');
  const listHolder = h('div');
  const historyHolder = h('div', { class: 'schedule-history' });
  const fail = error => toast(error.message, 'error');
  const act = action => async () => { try { await action(); } catch (error) { fail(error); } refresh(); };

  function edit(task) {
    historyHolder.replaceChildren();
    formHolder.replaceChildren(scheduleForm(task, { api, toast, capabilities: context.capabilities, folder: context.folder,
      onDone: () => { formHolder.replaceChildren(); refresh(); } }));
    formHolder.querySelector('input')?.focus();
  }

  function taskRow(task) {
    const toggle = h('input', { type: 'checkbox', checked: task.active, title: task.active ? 'פעילה: לחץ להשהיה' : 'מושהית: לחץ להפעלה', 'aria-label': 'פעילה' });
    toggle.addEventListener('change', act(() => api.schedule.setActive(task.id, toggle.checked)));
    const next = task.active && task.nextRunAt ? `הבאה: ${formatTime(task.nextRunAt)}` : task.active ? 'אין ריצה מתוזמנת' : 'מושהית';
    return row({
      title: h('span', { dir: 'auto' }, task.name),
      badges: [badge(task.scheduleText, 'info'), ...(task.error ? [badge(task.error, 'danger')] : []), ...(task.running ? [badge('רצה עכשיו', 'accent')] : []), ...(task.lastRun ? runBadges(task.lastRun) : [])],
      sub: [next, task.lastRun ? `אחרונה: ${formatTime(task.lastRun.startedAt)}` : 'עדיין לא רצה', task.folder].join(' · '),
      actions: [
        h('label', { class: 'schedule-toggle' }, toggle, task.active ? 'פעילה' : 'מושהית'),
        button('הרץ עכשיו', act(async () => { await api.schedule.runNow(task.id); toast('הריצה התחילה: סשן חדש ייפתח בסרגל'); }), { variant: 'primary', iconName: 'arrow-up' }),
        button('היסטוריה', () => { formHolder.replaceChildren(); showHistory(historyHolder, task, context); }, { iconName: 'history' }),
        button('עריכה', () => edit(task), { iconName: 'pencil' }),
        button('מחיקה', async () => {
          const title = task.running ? `המשימה "${task.name}" רצה עכשיו: למחוק ולעצור את הריצה?` : `למחוק את המשימה "${task.name}"?`;
          if (!await context.ask({ title, text: 'ההיסטוריה שלה תימחק. סשנים שכבר נוצרו ממנה נשארים.', confirmLabel: task.running ? 'מחיקה ועצירה' : 'מחיקה', danger: true })) return;
          await act(() => api.schedule.remove(task.id))();
          historyHolder.replaceChildren();
        }, { variant: 'danger', iconName: 'trash' }),
      ],
    });
  }

  let first = true;
  async function refresh() {
    if (first) { first = false; return load(listHolder, () => api.schedule.list(), draw); }
    try { listHolder.replaceChildren(...draw(await api.schedule.list())); } catch (error) { console.error('[schedule] refresh failed:', error); }
    return undefined;
  }
  const draw = ({ tasks, approvalMinutes }) => [
    tasks.length ? list(tasks.map(taskRow)) : empty('עדיין אין משימות מתוזמנות. "משימה חדשה" יוצר אחת.'),
    h('p', { class: 'lead' }, `ריצה שממתינה לאישור נעצרת אחרי ${approvalMinutes} דקות (scheduleApprovalMinutes ב-config.json).`),
  ];

  const timer = setInterval(() => {
    if (!body.isConnected) return clearInterval(timer);
    if (!formHolder.childElementCount) refresh();
    return undefined;
  }, REFRESH_MS);

  body.append(section('', 'משימות שרצות לבד לפי תזמון, כל ריצה בסשן חדש בתיקיית הפרויקט שלה. הן רצות רק כל עוד שרת ה-GUI פועל (node server.js); ריצה שהוחמצה תושלם פעם אחת כשהשרת עולה, אם הייתה ב-7 הימים האחרונים.',
    h('div', { class: 'panel-toolbar' }, button('משימה חדשה', () => edit(null), { variant: 'primary', iconName: 'plus' })),
    formHolder, listHolder, historyHolder));
  refresh();
}
