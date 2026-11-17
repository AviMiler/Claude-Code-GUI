/**
 * How the session list is shown, per browser (localStorage): grouping of the unpinned sessions, sort, and the folded
 * sections. What belongs to a session (pin, group, unread) is stored on the server instead (lib/sidebar-groups/).
 */
const KEY = 'claude-gui.sidebar-view';
const OLD_GROUPING_KEY = 'claude-gui.sidebar-grouping'; // the earlier date / project switch
export const GROUPINGS = ['date', 'project', 'none'];
export const SORTS = ['activity', 'created', 'name'];

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
};

/** @returns {{grouping:string, sort:string, collapsed:Object<string,boolean>}} the saved view (defaults: by date, by last activity) */
export function viewPrefs() {
  const saved = read() || {};
  let grouping = GROUPINGS.includes(saved.grouping) ? saved.grouping : 'date';
  if (!saved.grouping) { try { if (localStorage.getItem(OLD_GROUPING_KEY) === 'project') grouping = 'project'; } catch { /* storage may be blocked */ } }
  return {
    grouping, sort: SORTS.includes(saved.sort) ? saved.sort : 'activity',
    collapsed: saved.collapsed && typeof saved.collapsed === 'object' ? saved.collapsed : {},
  };
}

/** @param {Partial<ReturnType<typeof viewPrefs>>} change merged into the saved view */
export function saveViewPrefs(change) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...viewPrefs(), ...change })); } catch { /* storage may be blocked */ }
}

/** @param {string} sectionId @returns {boolean} the section is folded */
export const isCollapsed = sectionId => viewPrefs().collapsed[sectionId] === true;

/** Folds or unfolds one section. @param {string} sectionId @param {boolean} collapsed */
export function setCollapsed(sectionId, collapsed) {
  const next = { ...viewPrefs().collapsed };
  if (collapsed) next[sectionId] = true; else delete next[sectionId];
  saveViewPrefs({ collapsed: next });
}
