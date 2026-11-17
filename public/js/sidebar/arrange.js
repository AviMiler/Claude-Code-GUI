/**
 * Orders the sidebar's sessions into sections: pinned first (their manual order), then the user's groups, then the rest
 * by date, by project folder or flat. The sort (last activity / created / name) applies inside every section.
 */
import { folderName } from '../dom.js';
import { projectFolder } from '../worktree/project-folder.js';

const DAY_MS = 86400000;
/** @typedef {{id:string, title:string, tooltip?:string, group?:{id:string,name:string}, sessions:object[]}} Section */

const activityOf = session => session.updatedAt || session.createdAt || 0;
const SORTERS = {
  activity: (a, b) => activityOf(b) - activityOf(a),
  created: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
  name: (a, b) => String(a.name).localeCompare(String(b.name), 'he', { numeric: true, sensitivity: 'base' }),
};

function dateLabel(timestamp) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return 'היום';
  if (timestamp >= startOfToday - DAY_MS) return 'אתמול';
  if (timestamp >= startOfToday - 7 * DAY_MS) return '7 הימים האחרונים';
  if (timestamp >= startOfToday - 30 * DAY_MS) return '30 הימים האחרונים';
  return 'ישן יותר';
}

/** Parent folder + name, for two projects whose folders share a name. */
const longFolderName = cwd => String(cwd).split(/[\\/]/).filter(Boolean).slice(-2).join('/') || cwd;

function byDate(sessions, sort) {
  if (sort === 'name') return sessions.length ? [{ id: 'all', title: 'סשנים', sessions }] : [];
  const key = sort === 'created' ? session => session.createdAt || 0 : activityOf;
  const sections = [];
  for (const session of sessions) {
    const title = dateLabel(key(session));
    if (sections.at(-1)?.title !== title) sections.push({ id: `d:${title}`, title, sessions: [] });
    sections.at(-1).sessions.push(session);
  }
  return sections;
}

function byProject(sessions, sort) {
  const folders = new Map(); // a worktree session belongs to the folder it was opened from (projectFolder)
  for (const session of sessions) {
    const folder = projectFolder(session);
    if (!folders.has(folder)) folders.set(folder, { id: `p:${folder}`, title: folderName(folder), tooltip: folder, sessions: [] });
    folders.get(folder).sessions.push(session);
  }
  const list = [...folders.values()];
  if (sort === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'he'));
  const names = list.map(section => section.title);
  list.forEach(section => { if (names.filter(name => name === section.title).length > 1) section.title = longFolderName(section.tooltip); });
  return list;
}

/**
 * @param {object[]} sessions already filtered (search)
 * @param {{grouping:string, sort:string, groups:{id:string,name:string}[], hideEmptyGroups?:boolean}} view grouping: date|project|none;
 *   sort: activity|created|name
 * @returns {Section[]} sections in display order
 * @example arrange([...state.sessions.values()], { grouping: 'project', sort: 'name', groups: groupList() })
 */
export function arrange(sessions, { grouping, sort, groups, hideEmptyGroups = false }) {
  const sorted = [...sessions].sort(SORTERS[sort] || SORTERS.activity);
  const pinned = sorted.filter(session => session.pinned).sort((a, b) => (a.pinOrder ?? Infinity) - (b.pinOrder ?? Infinity));
  const unpinned = sorted.filter(session => !session.pinned);
  const known = new Set(groups.map(group => group.id));
  const sections = pinned.length ? [{ id: 'pinned', title: 'מוצמדים', sessions: pinned }] : [];
  for (const group of groups) {
    const members = unpinned.filter(session => session.groupId === group.id);
    if (members.length || !hideEmptyGroups) sections.push({ id: `g:${group.id}`, title: group.name, group, sessions: members });
  }
  const rest = unpinned.filter(session => !known.has(session.groupId));
  if (grouping === 'project') return [...sections, ...byProject(rest, sort)];
  if (grouping === 'none') return [...sections, ...(rest.length ? [{ id: 'all', title: groups.length ? 'ללא קבוצה' : 'סשנים', sessions: rest }] : [])];
  return [...sections, ...byDate(rest, sort)];
}
