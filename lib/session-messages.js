/** Messages of a session: sending, the queue while Claude works, and stopping a turn. */
const crypto = require('crypto');
const store = require('./session-store');
const runtime = require('./session-runtime');
const { httpError } = require('./http-utils');
const images = require('./images');
const uploads = require('./uploads');
const shellContext = require('./terminal/shell-context');
const { withPending } = shellContext;
const { publish, pushItem, setStatus, requireSession } = require('./session-common');

const MAX_QUEUE = 20;
/** Sessions whose turn the user stopped: the turn's end then says "stopped", not "failed" (session-service.js). */
const stopRequested = new Set();
// Config of the last request; queued messages start later, from a turn end that carries no config.
let lastConfig = null;

/** @param {object[]} attached stored images @param {object[]} files stored files (sent as paths) */
async function startTurn(id, text, config, attached = [], files = []) {
  const session = requireSession(id);
  pushItem(id, { kind: 'user', text, ...(attached.length && { images: attached }), ...(files.length && { files }) });
  setStatus(id, 'running');
  const held = shellContext.pending(id); // `!` results go in front of the message; put back if it never reaches the CLI
  try {
    await runtime.sendMessage(session, images.userContent(withPending(id, uploads.messageText(text, files)), attached), config);
  } catch (error) {
    console.error('[session-messages] cannot start turn:', error);
    shellContext.restore(id, held);
    pushItem(id, { kind: 'error', text: `לא ניתן להפעיל את Claude: ${error.message}` });
    setStatus(id, 'idle');
  }
}

/**
 * Starts a turn, or queues the message while one is running (sent when the turn ends).
 * Output arrives later through broadcast events.
 * @param {object[]} [attachedImages] new images ({ data, mediaType, name }) or stored ones ({ ref }); see lib/images.js
 * @param {object[]} [attachedFiles] other files ({ data, name } or { ref, name }); see lib/uploads.js
 * @param {{delivery?:'correct'|'queue'}} [options] while a turn runs: 'correct' sends it into the turn at once
 *   (runtime-corrections.js; falls back to the queue when the CLI cannot take it), 'queue' or nothing waits for its end
 * @returns {Promise<{queued:boolean, corrected?:boolean}>}
 */
async function sendMessage(id, text, config, attachedImages, attachedFiles, { delivery } = {}) {
  const session = requireSession(id);
  const message = typeof text === 'string' ? text.trim() : '';
  if (!message && !attachedImages?.length && !attachedFiles?.length) throw httpError(400, 'ההודעה ריקה');
  const queue = session.queue || [];
  if (session.status === 'running' && queue.length >= MAX_QUEUE) throw httpError(409, `התור מלא (${MAX_QUEUE} הודעות)`);
  const attached = images.saveImages(attachedImages);
  const files = uploads.saveFiles(attachedFiles);
  lastConfig = config;
  if (session.status === 'running' && delivery === 'correct') {
    const held = shellContext.pending(id);
    const uuid = runtime.correct(id, images.userContent(withPending(id, uploads.messageText(message, files)), attached));
    if (!uuid) shellContext.restore(id, held);
    if (uuid) {
      pushItem(id, { kind: 'user', text: message, correction: true, correctionId: uuid, ...(attached.length && { images: attached }), ...(files.length && { files }) });
      return { queued: false, corrected: true };
    }
  }
  if (session.status === 'running') {
    const entry = { id: crypto.randomUUID(), text: message, ...(attached.length && { images: attached }), ...(files.length && { files }), at: Date.now() };
    publish(store.update(id, { queue: [...queue, entry] }));
    return { queued: true };
  }
  await startTurn(id, message, config, attached, files);
  return { queued: false };
}

/** Sends the first queued message when the session is idle; an archived session's queue waits for its restore. */
function dispatchNext(id) {
  const session = store.get(id);
  if (!session || session.archived || session.status === 'running' || !session.queue?.length || !lastConfig) return;
  const [next, ...rest] = session.queue;
  publish(store.update(id, { queue: rest }));
  startTurn(id, next.text, lastConfig, next.images || [], next.files || []).catch(error => console.error('[session-messages] queued turn failed:', error));
}

function removeQueued(id, queueId) {
  const session = requireSession(id);
  const queue = session.queue || [];
  if (!queue.some(entry => entry.id === queueId)) throw httpError(404, 'ההודעה כבר לא בתור');
  publish(store.update(id, { queue: queue.filter(entry => entry.id !== queueId) }));
}

/** Continues a queue that stopped (a failed turn, or a server restart). */
function resumeQueue(id, config) {
  requireSession(id);
  lastConfig = config;
  dispatchNext(id);
}

/** Corrections that never reached Claude before a stop are named in the conversation, so nobody thinks they were read. */
function noteLostCorrections(id, uuids) {
  const lost = (store.get(id)?.items || []).filter(item => item.correction && uuids.includes(item.correctionId));
  if (lost.length) pushItem(id, { kind: 'notice', text: `${lost.length === 1 ? 'התיקון' : `${lost.length} תיקונים`} לא הגיע ל-Claude לפני העצירה: ${lost.map(item => `"${item.text.slice(0, 60)}"`).join(', ')}` });
}

/**
 * Stops the running turn. Queued messages are taken off the queue and returned (like Esc in the terminal,
 * which puts them back in the input), so a stop never sends the next one by itself.
 * Their images and files stay stored, so the browser can send them again by reference.
 * @returns {Promise<{stopped:boolean, queued:{text:string, images:object[], files:object[]}[]}>}
 */
async function stopSession(id) {
  const session = requireSession(id);
  const queued = session.queue || [];
  if (queued.length) publish(store.update(id, { queue: [] }));
  stopRequested.add(id);
  const stopped = await runtime.interrupt(id);
  noteLostCorrections(id, await runtime.dropCorrections(id));
  if (!stopped) {
    stopRequested.delete(id);
    if (queued.length && store.get(id)) publish(store.update(id, { queue: [...queued, ...(store.get(id).queue || [])] }));
    return { stopped, queued: [] };
  }
  return { stopped, queued: queued.map(entry => ({ text: entry.text, images: entry.images || [], files: entry.files || [] })) };
}

module.exports = { stopRequested, sendMessage, dispatchNext, removeQueued, resumeQueue, stopSession };
