/**
 * The sidebar fields of a session, set only through PATCH /api/sessions/:id and checked here: `pinned` (boolean),
 * `pinOrder` (a number: the place among the pinned ones, lower first), `groupId` (null, or the id of a group that exists),
 * `completed` and `markedUnread` (booleans). A wrong type is a 400, never silently dropped.
 */
const { httpError } = require('../http-utils');

const BOOLEANS = ['pinned', 'completed', 'markedUnread'];

/**
 * @param {object} patch the request body
 * @param {{archived?:boolean, pinOrder?:number}} current the session
 * @param {{hasGroup:(id:string)=>boolean, nextPinOrder:()=>number}} deps the group store and the next free pin place
 * @returns {object} the fields to store (empty when the patch has none of ours)
 */
function sidebarChanges(patch, current, { hasGroup, nextPinOrder }) {
  const changes = {};
  for (const key of BOOLEANS) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== 'boolean') throw httpError(400, `הערך של ${key} חייב להיות true או false`);
    changes[key] = patch[key];
  }
  if (changes.pinned && current.archived) delete changes.pinned; // an archived session is never pinned (session-archive.js)
  if (patch.pinOrder !== undefined) {
    if (typeof patch.pinOrder !== 'number' || !Number.isFinite(patch.pinOrder)) throw httpError(400, 'סדר ההצמדה חייב להיות מספר');
    changes.pinOrder = patch.pinOrder;
  }
  if (changes.pinned && changes.pinOrder === undefined && typeof current.pinOrder !== 'number') changes.pinOrder = nextPinOrder();
  if (patch.groupId !== undefined) {
    if (patch.groupId !== null && !(typeof patch.groupId === 'string' && hasGroup(patch.groupId))) throw httpError(400, 'הקבוצה לא קיימת');
    changes.groupId = patch.groupId;
  }
  return changes;
}

/**
 * A session that starts a new turn is no longer completed.
 * @param {{completed?:boolean}} session @param {string} status the status being set
 * @returns {{completed:false}|null} the change, or null
 */
const completionReset = (session, status) => (status === 'running' && session?.completed ? { completed: false } : null);

module.exports = { sidebarChanges, completionReset };
