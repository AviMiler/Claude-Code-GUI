/**
 * How the session list is shown, per browser (localStorage): grouping, sort, the two filters and the collapsed sections.
 * What belongs to a session (pin, group, completed, unread) is stored on the server instead (lib/sidebar-groups/).
 */
const KEY = 'claude-gui.sidebar-view';
const OLD_GROUPING_KEY = 'claude-gui.sidebar-grouping'; // the earlier date / project switch
export const GROUPINGS = ['date', 'project', 'groups', 'none'];
export const SORTS = ['activity', 'created', 'name'];
const DEFAULTS = { grouping: 'date', sort: 'activity', onlyUnread: false, onlyActive: false, collapsed: { completed: true }, allView: false };

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
};

/** @returns {{grouping:string, sort:string, onlyUnread:boolean, onlyActive:boolean, collapsed:Object<string,boolean>, allView:boolean}} */
export function viewPrefs() {
  const saved = read() || {};
  let grouping = GROUPINGS.includes(saved.grouping) ? saved.grouping : DEFAULTS.grouping;
  if (!saved.grouping) { try { if (localStorage.getItem(OLD_GROUPING_KEY) === 'project') grouping = 'project'; } catch { /* storage may be blocked */ } }
  return {
    grouping, sort: SORTS.includes(saved.sort) ? saved.sort : DEFAULTS.sort,
    onlyUnread: saved.onlyUnread === true, onlyActive: saved.onlyActive === true, allView: saved.allView === true,
    collapsed: { ...DEFAULTS.collapsed, ...(saved.collapsed && typeof saved.collapsed === 'object' ? saved.collapsed : {}) },
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
  saveViewPrefs({ collapsed: { ...viewPrefs().collapsed, [sectionId]: collapsed } });
}
