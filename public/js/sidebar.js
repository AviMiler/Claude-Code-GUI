/**
 * Session list: pinned sessions first, then grouped by date or by project folder (session-groups.js), with a search
 * over names, folders and the text of every conversation. Archived sessions have their own list (archive/).
 */
import { h, folderName } from './dom.js';
import { icon } from './icons.js';
import { searchSessions } from './session-search.js';
import { groupSessions, groupingPreference, saveGrouping } from './session-groups.js';
import { projectFolder } from './worktree/project-folder.js';
import { showingArchive, sessionsForList, archiveSwitch, archiveButton } from './archive/archive-list.js';

function statusOf(session, unread) {
  if (session.pendingPermissions?.length) return 'waiting';
  if (session.status === 'running') return 'running';
  return unread.has(session.id) ? 'unread' : 'idle';
}

/** The row's second line: the project folder (not repeated under its own group title) and a worktree session's branch. */
function placeLine(session, inProjectGroup) {
  const text = [inProjectGroup ? null : folderName(projectFolder(session)), session.worktree?.branch].filter(Boolean).join(' · ');
  return text ? h('small', { dir: 'auto' }, text) : null;
}

const STATUS_TITLES = { waiting: 'ממתין לאישור שלך', running: 'Claude עובד', unread: 'יש תשובה חדשה', idle: '' };

/** The matching text of a session found by its content: snippet with the match marked, and how many messages match. */
function snippetOf(content) {
  const { before, match, after } = content.snippet;
  return h('span', { class: 'snippet', dir: 'auto' }, before, h('mark', null, match), after,
    content.count > 1 ? h('em', null, ` · ${content.count}${content.count >= 99 ? '+' : ''} התאמות`) : null);
}

/** "Group by: date | project" switch at the top of the list. */
function groupingSwitch(current, onChange) {
  const option = (value, label) => h('button', { type: 'button', class: current === value ? 'on' : '', 'aria-pressed': String(current === value),
    onClick: () => { saveGrouping(value); onChange(); } }, label);
  return h('div', { class: 'grouping-switch', role: 'group', 'aria-label': 'קיבוץ הסשנים' }, option('date', 'לפי תאריך'), option('project', 'לפי פרויקט'));
}

/**
 * Re-renders the session list.
 * @param {HTMLElement} container
 * @param {{sessions:Map<string,object>, activeId:string|null, unread:Set<string>, filter:string,
 *   onSelect:(id:string, hit?:{indexes:number[], query:string})=>void, actions:{setPinned, archive, unarchive},
 *   onRegroup:()=>void}} options hit: the matching messages, to jump to; onRegroup re-renders the list (grouping, archive)
 */
export function renderSidebar(container, { sessions, activeId, unread, filter, onSelect, actions, onRegroup }) {
  const query = filter.trim();
  const listed = sessionsForList([...sessions.values()]); // the search covers the list shown: sessions or the archive
  const results = query ? searchSessions(listed, query) : null;
  const visible = listed.filter(session => !results || results.has(session.id));
  const archive = showingArchive();
  const grouping = groupingPreference();
  const nodes = listed.length && !archive ? [groupingSwitch(grouping, onRegroup)] : [];
  const groups = archive ? [{ title: 'בארכיון', sessions: visible }] : groupSessions(visible, grouping);
  for (const group of groups) {
    nodes.push(h('div', { class: 'group-title', title: group.tooltip || null, dir: 'auto' }, group.title));
    for (const session of group.sessions) {
      const status = statusOf(session, unread);
      const content = results?.get(session.id)?.content;
      const row = h('button', {
        type: 'button', class: 'session-row', 'aria-current': String(session.id === activeId), title: session.cwd,
        onClick: () => onSelect(session.id, content ? { indexes: content.indexes, query } : undefined),
      }, h('span', { class: `dot ${status}`, title: STATUS_TITLES[status] }),
      h('span', null, h('strong', { dir: 'auto' }, session.name), placeLine(session, grouping === 'project' && !session.pinned),
        content ? snippetOf(content) : null));
      const pin = archive ? null : h('button', { type: 'button', class: `pin-button${session.pinned ? ' pinned' : ''}`,
        title: session.pinned ? 'ביטול הצמדה' : 'הצמדה למעלה', 'aria-pressed': String(Boolean(session.pinned)),
        onClick: () => actions.setPinned(session.id, !session.pinned) }, icon('pin'));
      nodes.push(h('div', { class: 'session-item' }, row, archiveButton(session, actions), pin));
    }
  }
  if (!visible.length) {
    nodes.push(h('div', { class: 'group-title' }, query ? 'אין סשנים או הודעות תואמים' : 'עדיין אין סשנים'));
  }
  nodes.push(archiveSwitch([...sessions.values()].filter(session => session.archived).length, onRegroup));
  container.replaceChildren(...nodes.filter(Boolean));
}
