/** Permission prompts of a CLI process (session-runtime.js): the CLI asks (can_use_tool), the user answers in the GUI. */

/**
 * @param {{hooks:()=>object, live:Function, scheduleIdle:Function}} runtime the runtime's own parts (hooks: its session hooks)
 * @returns {{handleControlRequest:Function, resolvePermission:Function, answerPermission:Function}}
 */
function createPermissions({ hooks, live, scheduleIdle }) {
  function handleControlRequest(runtime, requestId, request) {
    if (request.subtype !== 'can_use_tool') {
      return runtime.proc.respondError(requestId, `${request.subtype} is not supported by the GUI`);
    }
    const prompt = {
      requestId, toolName: request.tool_name, displayName: request.display_name || request.tool_name,
      title: request.title || null, description: request.description || null, input: request.input || {},
      suggestions: request.permission_suggestions || [], toolUseId: request.tool_use_id || null,
      reason: request.decision_reason || null, blockedPath: request.blocked_path || null, createdAt: Date.now(),
    };
    runtime.pending.set(requestId, prompt);
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
    if (answer.behavior === 'allow') {
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

  return { handleControlRequest, resolvePermission, answerPermission };
}

module.exports = { createPermissions };
