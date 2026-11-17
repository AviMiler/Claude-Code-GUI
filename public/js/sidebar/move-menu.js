/** "העבר לקבוצה": a menu of the user's groups for one session (the context menu has no submenus, so it opens a second menu). */
import { openContextMenu } from '../context-menu/menu.js';
import { groupList, createGroupDialog } from './groups-store.js';

/**
 * @param {object} session
 * @param {{setGroup:(id:string, groupId:string|null)=>void}} actions
 */
export function openMoveMenu(session, actions) {
  const anchor = [...document.querySelectorAll('.session-item')].find(item => item.dataset.sessionId === session.id)?.querySelector('.session-row') || document.body;
  const entries = [
    ...groupList().map(group => ({ icon: session.groupId === group.id ? 'check' : 'folder', title: group.name, onSelect: () => actions.setGroup(session.id, group.id) })),
    session.groupId && { icon: 'x', title: 'הוצאה מהקבוצה', onSelect: () => actions.setGroup(session.id, null) },
    { icon: 'plus', title: 'קבוצה חדשה…', onSelect: async () => { const group = await createGroupDialog(); if (group) actions.setGroup(session.id, group.id); } },
  ].filter(Boolean);
  setTimeout(() => openContextMenu({ type: 'click', target: anchor }, entries)); // after the first menu has closed
}
