/**
 * The custom groups as this tab knows them. They live on the server (lib/sidebar-groups/): the state load carries them,
 * and every change is broadcast as a `sidebar-groups` event, so another tab learns of it at once (no polling).
 */
import { api } from '../api.js';
import { ask, toast } from '../ui.js';

let groups = [];

/** @returns {{id:string, name:string}[]} the groups in their manual order */
export const groupList = () => groups;

/** Replaces the list (state load, server event). @param {{id:string, name:string}[]|undefined} list */
export function setGroups(list) {
  if (Array.isArray(list)) groups = list;
}

const report = error => { toast(error.message, 'error'); return null; };

/**
 * Asks for a name and creates a group.
 * @returns {Promise<{id:string, name:string}|null>} null when cancelled or refused
 */
export async function createGroupDialog() {
  const name = await ask({ title: 'קבוצה חדשה', value: '', placeholder: 'שם הקבוצה', confirmLabel: 'יצירה' });
  if (!name) return null;
  const result = await api.createGroup(name).catch(report);
  if (!result) return null;
  groups = [...groups.filter(group => group.id !== result.group.id), result.group];
  return result.group;
}

/** Asks for a new name for a group. @param {{id:string, name:string}} group */
export async function renameGroupDialog(group) {
  const name = await ask({ title: 'שינוי שם הקבוצה', value: group.name, confirmLabel: 'שמירה' });
  if (name && name !== group.name) await api.renameGroup(group.id, name).catch(report);
}

/** Confirms and deletes a group; its sessions go back to the default grouping. @param {{id:string, name:string}} group */
export async function deleteGroupDialog(group) {
  const sure = await ask({ title: `למחוק את הקבוצה "${group.name}"?`, text: 'הסשנים שבה לא יימחקו, והם יחזרו לקיבוץ הרגיל.', confirmLabel: 'מחיקה', danger: true });
  if (sure) await api.deleteGroup(group.id).catch(report);
}

/** Moves a group one place up (-1) or down (+1). @param {string} id @param {number} step */
export async function moveGroup(id, step) {
  const ids = groups.map(group => group.id);
  const at = ids.indexOf(id);
  const to = at + step;
  if (at < 0 || to < 0 || to >= ids.length) return;
  [ids[at], ids[to]] = [ids[to], ids[at]];
  await api.reorderGroups(ids).catch(report);
}
