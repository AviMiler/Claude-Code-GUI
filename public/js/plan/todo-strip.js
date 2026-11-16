/**
 * Pinned task list above the main composer: the session's current todo list (the Plan pane's planState). Collapsed it
 * shows "N מתוך M" and the item in progress; expanded, the whole list. Hidden without a list, or when every item is done
 * and the turn has ended. The collapsed state is remembered (localStorage).
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { planState } from './plan-source.js';

const KEY = 'claude-gui.todo-strip-collapsed';
const MARK = { completed: 'check', in_progress: 'loader' };

const readCollapsed = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
const saveCollapsed = value => { try { localStorage.setItem(KEY, value ? '1' : '0'); } catch { /* storage may be blocked */ } };

/** @returns {{node:HTMLElement, update:(session:object|null)=>void}} */
export function createTodoStrip() {
  const node = h('div', { class: 'todo-strip', role: 'status', hidden: true });
  let collapsed = readCollapsed();
  let drawn = ''; // what is on screen: the strip is redrawn only when it changes, so nothing flickers
  let last = null;

  function toggle() {
    collapsed = !collapsed;
    saveCollapsed(collapsed);
    drawn = '';
    update(last);
  }

  function update(session) {
    last = session;
    const todos = session ? planState(session).todos : null;
    const done = todos?.filter(todo => todo.status === 'completed').length || 0;
    const running = session?.status === 'running';
    const hide = !todos?.length || (done === todos.length && !running);
    if (hide) { node.hidden = true; drawn = ''; return; }
    const current = todos.find(todo => todo.status === 'in_progress');
    const signature = JSON.stringify([collapsed, session.id, todos.map(todo => [todo.content, todo.status])]);
    node.hidden = false;
    if (signature === drawn) return;
    drawn = signature;
    node.classList.toggle('is-open', !collapsed);
    const head = h('button', { type: 'button', class: 'todo-strip-head', 'aria-expanded': String(!collapsed), onClick: toggle },
      icon('list-checks'), h('span', { class: 'todo-strip-count' }, `${done} מתוך ${todos.length}`),
      collapsed ? h('span', { class: 'todo-strip-current', dir: 'auto' }, current ? current.activeForm || current.content : '') : null,
      icon('chevron-down', 'todo-strip-chevron'));
    const list = collapsed ? null : h('ul', { class: 'todo-strip-list' }, todos.map(todo => h('li', { class: `todo-${todo.status}`, dir: 'auto' },
      icon(MARK[todo.status] || 'circle', todo.status === 'in_progress' ? 'spinning' : ''), h('span', null, todo.status === 'in_progress' ? todo.activeForm || todo.content : todo.content))));
    node.replaceChildren(head, ...(list ? [list] : []));
  }

  return { node, update };
}
