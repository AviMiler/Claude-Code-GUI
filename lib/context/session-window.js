/**
 * GET /api/sessions/:id/context-window: the real context window of the session's model (context-window.js).
 * The model comes from the server's own data (the running CLI's init event, the stored session, config.json),
 * never from the request. Read-only: it never starts a CLI process and never calls the model.
 */
const service = require('../session-service');
const runtime = require('../session-runtime');
const { contextWindowFor } = require('./context-window');

/** @returns {Promise<{window:number|null, source:string|null, estimate:boolean, model:string, warnPercent:number}>} */
function sessionContextWindow(config, sessionId) {
  const session = service.requireSession(sessionId);
  return contextWindowFor(config, session, runtime.infoFor(sessionId).model);
}

module.exports = { sessionContextWindow };
