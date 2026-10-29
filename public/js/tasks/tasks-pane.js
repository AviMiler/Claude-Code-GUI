/**
 * Background tasks pane (Claude Code Desktop): the session's shell commands and subagents that run beside the chat, with
 * status, the output tail of a command and a stop button. The same data and control requests as the /tasks panel, kept
 * on screen. The tasks arrive with the session (task events redraw the panes); the output is read on request, and again
 * when a running task changes (at most every two seconds), because the CLI offers a tail, not a stream.
 */
import { api } from '../api.js';
import { h, timeAgo, formatTokens } from '../dom.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { STATUS, TYPE_LABELS, duration } from './task-format.js';
import { readTaskOutput, stopTask } from './task-actions.js';

const REFRESH_MS = 2000;

/** What a running task looks like now: a change in it is a reason to read its output again. */
const signature = task => `${task.status}|${task.usage?.toolUses ?? ''}|${task.lastTool ?? ''}|${task.summary ?? ''}`;

/** @param {{rerender:()=>void}} deps rerender: draws the panes again when an output arrived @returns {import('../panes/pane-host.js').PaneDefinition} */
export function createTasksPane({ rerender }) {
  const shown = new Set(); // "session|task" whose output is open
  const outputs = new Map(); // "session|task" -> { text, at, signature }

  function load(sessionId, task) {
    const key = `${sessionId}|${task.id}`;
    const entry = outputs.get(key) || { text: 'טוען…', at: 0, signature: '' };
    outputs.set(key, { ...entry, at: Date.now(), signature: signature(task) });
    readTaskOutput((subtype, payload) => api.control({ sessionId }, subtype, payload), task).then(text => {
      outputs.set(key, { ...outputs.get(key), text });
      rerender();
    });
  }

  function card(session, task) {
    const key = `${session.id}|${task.id}`;
    const [label, tone] = STATUS[task.status] || [task.status, ''];
    const open = shown.has(key);
    const entry = outputs.get(key);
    // An open output is read again once its task changed since the last read (also when it just ended).
    if (open && entry && entry.signature !== signature(task) && Date.now() - entry.at > REFRESH_MS) load(session.id, task);
    const facts = [`התחיל ${timeAgo(task.startedAt)}`, duration(task), task.usage?.tokens ? `${formatTokens(task.usage.tokens)} טוקנים` : null,
      task.usage?.toolUses ? `${task.usage.toolUses} קריאות כלים` : null, task.lastTool && task.status === 'running' ? `כלי אחרון: ${task.lastTool}` : null].filter(Boolean).join(' · ');
    return h('div', { class: 'task-card', dataset: { status: task.status } },
      h('div', { class: 'task-head' }, h('span', { class: `badge ${tone}` }, label), TYPE_LABELS[task.type] && h('span', { class: 'badge' }, TYPE_LABELS[task.type]),
        task.agent && h('span', { class: 'badge' }, task.agent)),
      h('div', { class: 'task-title', dir: 'auto' }, task.description || task.agent || task.id),
      h('div', { class: 'task-facts' }, facts),
      task.summary && h('div', { class: 'task-summary', dir: 'auto' }, task.summary),
      h('div', { class: 'task-actions' },
        h('button', { type: 'button', class: 'btn small', onClick: () => { if (!shown.delete(key)) { shown.add(key); load(session.id, task); } rerender(); } }, icon('terminal'), open ? 'הסתרת פלט' : 'פלט'),
        open && h('button', { type: 'button', class: 'btn small', title: 'קריאה מחדש של סוף הפלט', onClick: () => load(session.id, task) }, icon('refresh'), 'רענון'),
        task.status === 'running' && h('button', { type: 'button', class: 'btn small danger', onClick: () => stopTask((subtype, payload) => api.control({ sessionId: session.id }, subtype, payload), task, toast) }, icon('stop'), 'עצירה')),
      open && h('pre', { class: 'output-pre', dir: 'ltr' }, entry?.text ?? 'טוען…'));
  }

  return {
    id: 'tasks', title: 'משימות רקע', icon: 'list',
    render(body, session) {
      const tasks = [...(session.tasks || [])].sort((a, b) => b.startedAt - a.startedAt);
      const running = tasks.filter(task => task.status === 'running').length;
      body.replaceChildren(...(tasks.length
        ? [h('p', { class: 'detail-muted' }, running ? `${running} רצות עכשיו · ` : '', `${tasks.length} בסך הכול בסשן הזה`), ...tasks.map(task => card(session, task))]
        : [h('p', { class: 'detail-muted' }, 'אין משימות רקע. כש-Claude מריץ פקודה ארוכה ברקע או סוכן משנה, היא תופיע כאן.')]));
    },
  };
}
