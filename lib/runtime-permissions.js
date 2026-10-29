/**
 * Prompts of a CLI process (session-runtime.js) that wait for the user: tool permissions (can_use_tool) and MCP
 * elicitations (a server asks for input); the user answers in the GUI.
 */
const { httpError } = require('./http-utils');
const { normalizeElicitation } = require('./elicitation/elicitation-normalize');
const { replyFor, CANCEL_REPLY } = require('./elicitation/elicitation-reply');

/**
 * @param {{hooks:()=>object, live:Function, scheduleIdle:Function}} runtime the runtime's own parts (hooks: its session hooks)
 * @returns {{handleControlRequest:Function, resolvePermission:Function, answerPermission:Function, cancelAll:Function}}
 */
function createPermissions({ hooks, live, scheduleIdle }) {
  function handleControlRequest(runtime, requestId, request) {
    if (request.subtype === 'elicitation') return waitFor(runtime, normalizeElicitation(requestId, request));
    if (request.subtype !== 'can_use_tool') {
      return runtime.proc.respondError(requestId, `${request.subtype} is not supported by the GUI`);
    }
    return waitFor(runtime, {
      requestId, toolName: request.tool_name, displayName: request.display_name || request.tool_name,
      title: request.title || null, description: request.description || null, input: request.input || {},
      suggestions: request.permission_suggestions || [], toolUseId: request.tool_use_id || null,
      reason: request.decision_reason || null, blockedPath: request.blocked_path || null, createdAt: Date.now(),
    });
  }

  function waitFor(runtime, prompt) {
    runtime.pending.set(prompt.requestId, prompt);
    clearTimeout(runtime.idleTimer);
    return hooks().onPermission(runtime.sessionId, prompt);
  }

  function resolvePermission(runtime, requestId) {
    if (!runtime.pending.delete(requestId)) return;
    hooks().onPermissionResolved(runtime.sessionId, requestId);
  }

  /**
   * Answers a pending permission prompt.
   * @param {{behavior:'allow'|'deny', alwaysAllow?:boolean, setMode?:string, updatedInput?:object, message?:string}} answer
   * @returns {object|null} the prompt that was answered
   */
  function answerPermission(sessionId, requestId, answer) {
    const runtime = live(sessionId);
    const prompt = runtime?.pending.get(requestId);
    if (!prompt) return null;
    if (prompt.kind === 'elicitation') runtime.proc.respond(requestId, replyFor(prompt, answer)); // throws 400 and stays pending when it does not fit
    else if (!answer.behavior) throw httpError(400, 'תשובה לא מתאימה לבקשת הרשאה');
    else if (answer.behavior === 'allow') {
      const updatedPermissions = answer.alwaysAllow ? [...prompt.suggestions] : [];
      if (answer.setMode) updatedPermissions.push({ type: 'setMode', mode: answer.setMode, destination: 'session' });
      runtime.proc.respond(requestId, {
        behavior: 'allow', updatedInput: answer.updatedInput || prompt.input,
        ...(updatedPermissions.length && { updatedPermissions }),
      });
    } else {
      runtime.proc.respond(requestId, { behavior: 'deny', message: answer.message || 'The user denied this request.' });
    }
    resolvePermission(runtime, requestId);
    scheduleIdle(runtime);
    return prompt;
  }

  /** The user stops the turn: every waiting request is answered so the CLI can stop (an elicitation is cancelled, a permission denied). */
  function cancelAll(runtime) {
    for (const [requestId, prompt] of [...runtime.pending]) {
      runtime.proc.respond(requestId, prompt.kind === 'elicitation' ? CANCEL_REPLY : { behavior: 'deny', message: 'Interrupted by the user', interrupt: true });
      resolvePermission(runtime, requestId);
    }
  }

  return { handleControlRequest, resolvePermission, answerPermission, cancelAll };
}

module.exports = { createPermissions };
