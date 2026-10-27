/**
 * The sidebar's archive (Claude Code Desktop's "Archived"): archived sessions leave the session list; a button at its
 * foot, "ארכיון (N)", switches the list to them, newest archived first, each with a restore button.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';

let showing = false; // in this page only: a reload starts on the sessions

/** @returns {boolean} the sidebar shows the archive (never while it is empty) */
export const showingArchive = () => showing;

/**
 * The sessions the sidebar lists now: the archived ones (by archive time) or the others. Leaves an emptied archive.
 * @param {object[]} sessions every session
 */
export function sessionsForList(sessions) {
  const archived = sessions.filter(session => session.archived);
  if (!archived.length) showing = false;
  return showing ? archived.sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0)) : sessions.filter(session => !session.archived);
}

/** The foot of the session list: "ארכיון (N)", or the way back from it. @param {()=>void} onChange redraws the list */
export function archiveSwitch(count, onChange) {
  if (!count) return null;
  const toggle = () => { showing = !showing; onChange(); };
  return showing
    ? h('button', { type: 'button', class: 'archive-switch back', onClick: toggle }, icon('chevron-down', 'back-arrow'), 'חזרה לסשנים')
    : h('button', { type: 'button', class: 'archive-switch', title: 'סשנים שהועברו לארכיון', onClick: toggle }, icon('archive'), `ארכיון (${count})`);
}

/**
 * A row's archive button: archive (the session list) or restore (the archive). Shown on hover, like the pin.
 * @param {{archive:(id:string)=>void, unarchive:(id:string)=>void}} actions
 */
export function archiveButton(session, actions) {
  return session.archived
    ? h('button', { type: 'button', class: 'row-action restore', title: 'שחזור מהארכיון', onClick: () => actions.unarchive(session.id) }, icon('history'))
    : h('button', { type: 'button', class: 'row-action', title: 'העברה לארכיון', onClick: () => actions.archive(session.id) }, icon('archive'));
}
