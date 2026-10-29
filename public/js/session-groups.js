/** How the sidebar groups sessions: pinned first, then by date or by project folder (the user's choice, per browser). */
import { folderName } from './dom.js';
import { projectFolder } from './worktree/project-folder.js';

const GROUPING_KEY = 'claude-gui.sidebar-grouping';
const DAY_MS = 86400000;

/** @typedef {'date'|'project'} Grouping */
/** @typedef {{title:string, tooltip?:string, sessions:object[]}} SessionGroup */

/** @returns {Grouping} */
export function groupingPreference() {
  try { return localStorage.getItem(GROUPING_KEY) === 'project' ? 'project' : 'date'; } catch { return 'date'; }
}

/** @param {Grouping} grouping */
export function saveGrouping(grouping) {
  try { localStorage.setItem(GROUPING_KEY, grouping); } catch { /* storage may be blocked */ }
}

const lastActivity = session => session.updatedAt || session.createdAt;

function dateLabel(timestamp) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return 'היום';
  if (timestamp >= startOfToday - DAY_MS) return 'אתמול';
  if (timestamp >= startOfToday - 7 * DAY_MS) return '7 הימים האחרונים';
  if (timestamp >= startOfToday - 30 * DAY_MS) return '30 הימים האחרונים';
  return 'ישן יותר';
}

/** Parent folder + name, for two projects whose folders share a name. */
function longFolderName(cwd) {
  const parts = String(cwd).split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join('/') || cwd;
}

function byDate(sessions) {
  const groups = [];
  for (const session of sessions) {
    const title = dateLabel(lastActivity(session));
    if (groups.at(-1)?.title !== title) groups.push({ title, sessions: [] });
    groups.at(-1).sessions.push(session);
  }
  return groups;
}

function byProject(sessions) {
  // folder -> group; sessions arrive newest first, so groups are ordered by latest activity. A worktree session belongs
  // to the folder it was opened from (projectFolder), not to its own worktree.
  const groups = new Map();
  for (const session of sessions) {
    const folder = projectFolder(session);
    if (!groups.has(folder)) groups.set(folder, { title: folderName(folder), tooltip: folder, sessions: [] });
    groups.get(folder).sessions.push(session);
  }
  const list = [...groups.values()];
  const names = list.map(group => group.title);
  list.forEach(group => {
    if (names.filter(name => name === group.title).length > 1) group.title = longFolderName(group.tooltip);
  });
  return list;
}

/**
 * Orders and groups sessions for the sidebar. A pinned session appears only under "מוצמדים".
 * @param {object[]} sessions already filtered (search)
 * @param {Grouping} grouping
 * @returns {SessionGroup[]} groups in display order, sessions newest first inside each
 * @example groupSessions([...state.sessions.values()], 'project')
 */
export function groupSessions(sessions, grouping) {
  const ordered = [...sessions].sort((a, b) => lastActivity(b) - lastActivity(a));
  const pinned = ordered.filter(session => session.pinned);
  const rest = ordered.filter(session => !session.pinned);
  return [
    ...(pinned.length ? [{ title: 'מוצמדים', sessions: pinned }] : []),
    ...(grouping === 'project' ? byProject(rest) : byDate(rest)),
  ];
}
