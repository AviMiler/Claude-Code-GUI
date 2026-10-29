/** Rewind: preview what a return to a user message would do, and do it (files, conversation, or both). */
const { requireSession } = require('../session-common');
const runtime = require('../session-runtime');
const tasks = require('../task-tracker');
const { broadcast } = require('../event-hub');
const { httpError } = require('../http-utils');
const { requireRewindable, findPoint } = require('./rewind-points');
const { previewFiles, restoreFiles } = require('./rewind-files');
const { cutConversation, requireCutPoint } = require('./rewind-conversation');
const { withLock, isRewinding } = require('./rewind-lock');

const MODES = ['conversation', 'code', 'both'];

/** @returns {Promise<{text:string, conversation:{available:boolean, reason:string|null}, code:object, runningTasks:number}>} */
async function previewRewind(sessionId, uuid, config) {
  if (isRewinding(sessionId)) throw httpError(409, 'חזרה לנקודה קודמת מתבצעת כרגע.');
  const session = requireRewindable(requireSession(sessionId));
  const point = findPoint(session, uuid);
  const { item } = point;
  let conversation = { available: true, reason: null };
  try { requireCutPoint(point); } catch (error) { conversation = { available: false, reason: error.message }; }
  return { text: item.text, conversation, code: await previewFiles(session, config, uuid), runningTasks: tasks.list(sessionId).filter(task => task.status === 'running').length };
}

/**
 * @param {{uuid:string, mode:'conversation'|'code'|'both'}} request
 * @returns {Promise<{text:string, images:object[], files:object[], mode:string}>} the message, to put back in the composer
 */
function rewind(sessionId, { uuid, mode }, config) {
  if (!MODES.includes(mode)) throw httpError(400, 'סוג החזרה לא מוכר');
  if (isRewinding(sessionId)) throw httpError(409, 'חזרה לנקודה קודמת כבר מתבצעת בסשן הזה.');
  return withLock(sessionId, async () => {
    const session = requireRewindable(requireSession(sessionId));
    const point = findPoint(session, uuid);
    if (mode !== 'code') requireCutPoint(point);
    if (mode !== 'conversation') await restoreFiles(session, config, uuid); // files first: if that fails nothing else changes
    if (mode !== 'code') await cutConversation(session, point, config).catch(error => { throw httpError(error.status || 500, `${error.message}${mode === 'both' ? ' (הקבצים כבר הוחזרו.)' : ''}`); });
    else broadcast({ type: 'rewound', sessionId, keep: null }); // the files changed: the Changes pane fetches again
    return { text: point.item.text, images: point.item.images || [], files: point.item.files || [], mode };
  });
}

module.exports = { previewRewind, rewind };
