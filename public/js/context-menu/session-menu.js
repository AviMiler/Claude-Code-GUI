/**
 * The menu of a sidebar session (Claude Code Desktop: hover a session, open its menu): right click or Shift+F10 on the
 * row, or its "⋯" button. Every item acts on that session by id; the open session does not change unless asked.
 */
import { h, copyText } from '../dom.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { projectFolder } from '../worktree/project-folder.js';
import { openContextMenu, hasSelection } from './menu.js';

let current = { sessions: new Map(), activeId: null, actions: null, onSelect: null }; // from the latest sidebar render
const lists = new WeakSet();

const copyPath = async path => { await copyText(path); toast('הנתיב הועתק'); };

function entriesFor(session) {
  const { actions, onSelect, activeId } = current;
  const live = !session.archived;
  return [
    session.id !== activeId && { icon: 'message', title: 'פתיחה', onSelect: () => onSelect(session.id) },
    session.id !== activeId && live && { icon: 'columns', title: 'פתיחה בחלון המפוצל', onSelect: () => actions.openInSplit(session.id) },
    { icon: 'pencil', title: 'שינוי שם', onSelect: () => actions.rename(null, session.id) },
    live && { icon: 'pin', title: session.pinned ? 'ביטול הצמדה' : 'הצמדה למעלה', onSelect: () => actions.setPinned(session.id, !session.pinned) },
    live && session.claudeSessionId && { icon: 'branch', title: 'ענף חדש מהשיחה', onSelect: () => actions.fork(session.id) },
    { icon: 'copy', title: 'העתקת נתיב התיקייה', onSelect: () => copyPath(projectFolder(session)) },
    session.worktree && { icon: 'copy', title: 'העתקת נתיב ה-worktree', onSelect: () => copyPath(session.worktree.path) },
    live ? { icon: 'archive', title: 'העברה לארכיון', onSelect: () => actions.archive(session.id) }
      : { icon: 'history', title: 'שחזור מהארכיון', onSelect: () => actions.unarchive(session.id) },
    { icon: 'trash', title: 'מחיקה', danger: true, onSelect: () => actions.remove(session.id) },
  ].filter(Boolean);
}

/** The row's "⋯" button (shown on hover, beside the pin). */
export function sessionMenuButton(session) {
  return h('button', { type: 'button', class: 'row-action more', title: 'פעולות', 'aria-haspopup': 'menu',
    onClick: event => openContextMenu(event, entriesFor(session)) }, icon('more'));
}

/**
 * Called on every sidebar render: keeps the menu's view of the sessions current and listens once per list.
 * @param {HTMLElement} list the session list @param {{sessions:Map, activeId:string|null, actions:object, onSelect:Function}} view
 */
export function enableSessionMenus(list, view) {
  current = view;
  if (lists.has(list)) return;
  lists.add(list);
  list.addEventListener('contextmenu', event => {
    const id = event.target.closest('.session-item')?.dataset.sessionId;
    const session = id && current.sessions.get(id);
    if (!session || hasSelection()) return;
    event.preventDefault();
    openContextMenu(event, entriesFor(session));
  });
}
