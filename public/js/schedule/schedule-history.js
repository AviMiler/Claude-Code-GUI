/** A task's run history (last 50): when, how long, how it ended, why, and a link to the run's session. */
import { h } from '../dom.js';
import { row, list, empty, button, load } from '../panels/kit.js';
import { state } from '../state.js';
import { runBadges, formatTime, formatDuration } from './schedule-labels.js';

/**
 * @param {HTMLElement} holder where the history goes
 * @param {object} task
 * @param {{api:object, toast:Function, selectSession:(session:object)=>void, close:()=>void}} context
 */
export function showHistory(holder, task, context) {
  const open = id => {
    const session = state.sessions.get(id);
    if (!session) return context.toast('הסשן של הריצה כבר לא קיים', 'error');
    context.close();
    return context.selectSession(session);
  };
  const runRow = run => row({
    title: h('span', null, formatTime(run.startedAt)),
    badges: runBadges(run),
    sub: [run.durationMs ? `משך: ${formatDuration(run.durationMs)}` : '', run.reason].filter(Boolean).join(' · ') || null,
    actions: run.sessionId ? [button('פתח את הסשן', () => open(run.sessionId), { iconName: 'external' })] : [],
  });
  return load(holder, () => context.api.schedule.runs(task.id), ({ runs }) => [
    h('h4', { dir: 'auto' }, `היסטוריית ריצות: ${task.name}`),
    runs.length ? list(runs.map(runRow)) : empty('עדיין אין ריצות.'),
  ]);
}
