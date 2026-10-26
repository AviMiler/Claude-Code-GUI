/** Session list grouped by recency, with a search filter. */
import { h, folderName } from './dom.js';

const DAY_MS = 86400000;

function groupLabel(timestamp) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return 'היום';
  if (timestamp >= startOfToday - DAY_MS) return 'אתמול';
  if (timestamp >= startOfToday - 7 * DAY_MS) return '7 הימים האחרונים';
  if (timestamp >= startOfToday - 30 * DAY_MS) return '30 הימים האחרונים';
  return 'ישן יותר';
}

function statusOf(session, unread) {
  if (session.pendingPermissions?.length) return 'waiting';
  if (session.status === 'running') return 'running';
  return unread.has(session.id) ? 'unread' : 'idle';
}

const STATUS_TITLES = { waiting: 'ממתין לאישור שלך', running: 'Claude עובד', unread: 'יש תשובה חדשה', idle: '' };

/**
 * Re-renders the session list.
 * @param {HTMLElement} container
 * @param {{sessions:Map<string,object>, activeId:string|null, unread:Set<string>, filter:string, onSelect:(id:string)=>void}} options
 */
export function renderSidebar(container, { sessions, activeId, unread, filter, onSelect }) {
  const needle = filter.trim().toLowerCase();
  const ordered = [...sessions.values()]
    .filter(session => !needle || `${session.name} ${session.cwd}`.toLowerCase().includes(needle))
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const nodes = [];
  let lastGroup = null;
  for (const session of ordered) {
    const group = groupLabel(session.updatedAt || session.createdAt);
    if (group !== lastGroup) nodes.push(h('div', { class: 'group-title' }, group));
    lastGroup = group;
    const status = statusOf(session, unread);
    nodes.push(h('button', {
      type: 'button', class: 'session-row', 'aria-current': String(session.id === activeId), title: session.cwd,
      onClick: () => onSelect(session.id),
    }, h('span', { class: `dot ${status}`, title: STATUS_TITLES[status] }),
    h('span', null, h('strong', { dir: 'auto' }, session.name), h('small', null, folderName(session.cwd)))));
  }
  if (!nodes.length) {
    nodes.push(h('div', { class: 'group-title' }, needle ? 'אין סשנים תואמים' : 'עדיין אין סשנים'));
  }
  container.replaceChildren(...nodes);
}
