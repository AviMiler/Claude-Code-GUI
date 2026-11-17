/**
 * Session list: pinned sessions first, then the user's groups, then by date or project folder (sidebar/arrange.js), with light rows
 * for the CLI conversations no session holds (cli-list/light-rows.js) and a search in three modes (cli-list/search-modes.js).
 * Archived sessions have their own list (archive/).
 */
import { h, folderName } from './dom.js';
import { icon } from './icons.js';
import { colorDot } from './session-color/color-dot.js';
import { arrange } from './sidebar/arrange.js';
import { viewPrefs } from './sidebar/prefs.js';
import { groupList } from './sidebar/groups-store.js';
import { statusOf, statusDot } from './sidebar/status.js';
import { sectionHeader } from './sidebar/section-header.js';
import { viewBar } from './sidebar/view-bar.js';
import { lightRows, lightRowNode, capNotice } from './cli-list/light-rows.js';
import { applySearch, searchModeControl } from './cli-list/search-modes.js';
import { projectFolder } from './worktree/project-folder.js';
import { showingArchive, sessionsForList, archiveSwitch, restoreButton } from './archive/archive-list.js';
import { sessionMenuButton, enableSessionMenus } from './context-menu/session-menu.js';
import { markSessionRows } from './split-focus.js';

/** The row's second line: the project folder (not repeated under its own group title) and a worktree session's branch. */
function placeLine(session, inProjectGroup) {
  const text = [inProjectGroup ? null : folderName(projectFolder(session)), session.worktree?.branch].filter(Boolean).join(' · ');
  return text ? h('small', { dir: 'auto' }, text) : null;
}

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
 *   onSelect:(id:string, hit?:{indexes:number[], query:string})=>void, actions:{setPinned, archive, unarchive},
 *   onRegroup:()=>void, focusedId?:string|null, alsoId?:string|null, onSplit?:(id:string)=>void}} options hit: the matching
 *   messages, to jump to; onRegroup re-renders the list (grouping, archive); focusedId: the focused pane's session (the primary
 *   highlight, default the active one); alsoId: the other visible session; onSplit: Alt+click opens a session in the split pane
 */
export function renderSidebar(container, { sessions, activeId, unread, filter, onSelect, actions, onRegroup, focusedId = activeId, alsoId = null, onSplit }) {
  const query = filter.trim();
  const listed = sessionsForList([...sessions.values()]); // the search covers the list shown: sessions or the archive
  const archive = showingArchive();
  const light = archive ? { rows: [], total: 0 } : lightRows(sessions.values(), onRegroup);
  const { results, rows } = applySearch(listed, light.rows, query, onRegroup);
  const visible = [...listed.filter(session => !results || results.has(session.id)), ...rows];
  const { grouping, sort } = viewPrefs();
  const nodes = query ? [searchModeControl(query, onRegroup)] : [];
  if (!archive) nodes.push(viewBar(onRegroup));
  const sections = archive ? [{ id: 'archive', title: 'בארכיון', sessions: visible }]
    : arrange(visible, { grouping, sort, groups: groupList(), hideEmptyGroups: Boolean(query) });
  for (const section of sections) {
    const { row: header, folded } = archive ? { row: h('div', { class: 'group-title' }, section.title), folded: false } : sectionHeader(section, { onToggle: onRegroup, folding: !query });
    nodes.push(header);
    if (folded) continue;
    for (const session of section.sessions) {
      if (session.light) {
        nodes.push(lightRowNode(session, { inProjectGroup: section.id.startsWith('p:'), snippet: session.content ? snippetOf(session.content) : null, query, onSelect }));
        continue;
      }
      const status = statusOf(session, unread);
      const mark = status === 'unread';
      const content = results?.get(session.id)?.content;
      const row = h('button', {
        type: 'button', class: 'session-row', title: session.cwd, 'data-unread': mark ? 'true' : null,
        onClick: event => (event.altKey && onSplit && !archive ? onSplit(session.id) : onSelect(session.id, content ? { indexes: content.indexes, query } : undefined)),
      }, statusDot(status),
      h('span', null, h('strong', { dir: 'auto' }, colorDot(session), session.scheduled ? icon('clock', 'schedule-badge') : null, session.completed ? icon('check-circle', 'done-badge') : null, session.name), placeLine(session, section.id.startsWith('p:')),
        content ? snippetOf(content) : null));
      const pin = archive ? null : h('button', { type: 'button', class: `pin-button${session.pinned ? ' pinned' : ''}`,
        title: session.pinned ? 'ביטול הצמדה' : 'הצמדה למעלה', 'aria-pressed': String(Boolean(session.pinned)),
        onClick: () => actions.setPinned(session.id, !session.pinned) }, icon('pin'));
      nodes.push(h('div', { class: `session-item${mark ? ' unread' : ''}${session.completed ? ' completed' : ''}`, dataset: { sessionId: session.id } }, row, sessionMenuButton(session), restoreButton(session, actions), pin));
    }
  }
  if (!visible.length) {
    nodes.push(h('div', { class: 'group-title' }, query ? 'אין סשנים או הודעות תואמים' : 'עדיין אין סשנים'));
  }
  if (!query) nodes.push(capNotice(light.rows.length, light.total));
  nodes.push(archiveSwitch([...sessions.values()].filter(session => session.archived).length, onRegroup));
  container.replaceChildren(...nodes.filter(Boolean));
  markSessionRows(container, { focusedId, alsoId });
  enableSessionMenus(container, { sessions, activeId, actions, onSelect }); // right click / Shift+F10 on a row
}
