/**
 * Plan pane (Claude Code Desktop): the plan Claude proposed in plan mode and its current todo list, kept beside the
 * chat. Read from the session's items, so it is live and costs nothing. Approving a plan stays on its card above the composer.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { renderMarkdown } from '../markdown.js';
import { planState } from './plan-source.js';

const todoIcon = status => (status === 'completed' ? 'check-circle' : status === 'in_progress' ? 'circle-dot' : 'circle');

function todoList(todos) {
  const done = todos.filter(todo => todo.status === 'completed').length;
  return h('section', { class: 'plan-todos' }, h('h4', null, icon('list-checks'), `משימות · ${done}/${todos.length}`),
    todos.map(todo => h('div', { class: `todo ${todo.status}`, dir: 'auto' }, icon(todoIcon(todo.status)),
      h('span', null, todo.status === 'in_progress' ? todo.activeForm || todo.content : todo.content))));
}

/** @returns {import('../panes/pane-host.js').PaneDefinition} */
export function createPlanPane() {
  let shown = { id: null, key: null }; // a refresh with the same plan and todos draws nothing
  return {
    id: 'plan', title: 'תוכנית', icon: 'map',
    render(body, session) {
      const { plan, pending, todos } = planState(session);
      const key = JSON.stringify([plan, pending, todos, session.mode === 'plan']);
      if (shown.id === session.id && shown.key === key) return;
      shown = { id: session.id, key };
      const empty = session.mode === 'plan' ? 'Claude עדיין לא הציע תוכנית. הוא יציג אותה כאן לפני שיתחיל לעבוד.'
        : 'אין תוכנית. מצב תכנון (Shift+Tab או /plan) גורם ל-Claude להציע תוכנית לפני שהוא משנה משהו.';
      body.replaceChildren(...(plan || todos ? [
        plan && h('section', { class: 'plan-text' }, h('h4', null, icon('map'), 'התוכנית', pending && h('span', { class: 'badge warning' }, 'ממתינה לאישור')),
          h('div', { class: 'markdown', html: renderMarkdown(plan) })),
        todos && todoList(todos),
      ].filter(Boolean) : [h('p', { class: 'detail-muted' }, empty)]));
    },
  };
}
