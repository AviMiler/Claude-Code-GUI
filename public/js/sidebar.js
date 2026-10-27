/** Session list grouped by recency, with a search over names, folders and the text of every conversation. */
import { h, folderName } from './dom.js';
import { searchSessions } from './session-search.js';

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

/** The matching text of a session found by its content: snippet with the match marked, and how many messages match. */
function snippetOf(content) {
  const { before, match, after } = content.snippet;
  return h('span', { class: 'snippet', dir: 'auto' }, before, h('mark', null, match), after,
    content.count > 1 ? h('em', null, ` · ${content.count}${content.count >= 99 ? '+' : ''} התאמות`) : null);
}

/**
 * Re-renders the session list.
 * @param {HTMLElement} container
 * @param {{sessions:Map<string,object>, activeId:string|null, unread:Set<string>, filter:string,
 *   onSelect:(id:string, hit?:{indexes:number[], query:string})=>void}} options hit: the matching messages, to jump to
 */
export function renderSidebar(container, { sessions, activeId, unread, filter, onSelect }) {
  const query = filter.trim();
  const results = query ? searchSessions(sessions.values(), query) : null;
  const ordered = [...sessions.values()]
    .filter(session => !results || results.has(session.id))
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const nodes = [];
  let lastGroup = null;
  for (const session of ordered) {
    const group = groupLabel(session.updatedAt || session.createdAt);
    if (group !== lastGroup) nodes.push(h('div', { class: 'group-title' }, group));
    lastGroup = group;
    const status = statusOf(session, unread);
    const content = results?.get(session.id)?.content;
    nodes.push(h('button', {
      type: 'button', class: 'session-row', 'aria-current': String(session.id === activeId), title: session.cwd,
      onClick: () => onSelect(session.id, content ? { indexes: content.indexes, query } : undefined),
    }, h('span', { class: `dot ${status}`, title: STATUS_TITLES[status] }),
    h('span', null, h('strong', { dir: 'auto' }, session.name), h('small', null, folderName(session.cwd)),
      content ? snippetOf(content) : null)));
  }
  if (!nodes.length) {
    nodes.push(h('div', { class: 'group-title' }, query ? 'אין סשנים או הודעות תואמים' : 'עדיין אין סשנים'));
  }
  container.replaceChildren(...nodes);
}
