/**
 * What a session's CLI process reports (session-runtime.js): events become items, deltas, task and mode updates for
 * the session hooks; a result ends the turn (unless a late correction holds it, runtime-corrections.js); an exit cleans up.
 */
const { translateEvent, translateDelta, readInit, readTaskEvent } = require('./event-translator');
const corrections = require('./runtime-corrections');

/**
 * @param {{hooks:()=>object, runtimes:Map, scheduleIdle:Function, permissions:object, spare:object}} runtime the runtime's parts
 * @returns {{handleMessage:(runtime:object, event:object)=>void, handleExit:(runtime:object, info:object)=>void}}
 */
function createRuntimeEvents({ hooks, runtimes, scheduleIdle, permissions, spare }) {
  function endTurn(runtime) {
    runtime.turnActive = false;
    clearTimeout(runtime.interruptTimer);
    hooks().onTurnEnd(runtime.sessionId);
    scheduleIdle(runtime);
  }

  function handleMessage(runtime, event) {
    // A late correction's next turn after the hold gave up: the session is working again.
    if (corrections.noteEvent(runtime, event) && !runtime.turnActive) { runtime.turnActive = true; hooks().onTurnResume(runtime.sessionId); }
    if (event.session_id) hooks().onSessionId(runtime.sessionId, event.session_id);
    // The CLI took a message in (replay) or answered (assistant): the points a rewind can go back to (rewind/).
    if (event.type === 'user' && event.isReplay && event.uuid) hooks().onUserReplay(runtime.sessionId, event.uuid, event.session_id);
    if (event.type === 'assistant' && !event.parent_tool_use_id && event.uuid) hooks().onAssistantUuid(runtime.sessionId, event.uuid, event.session_id);
    const info = readInit(event);
    if (info) { runtime.info = info; hooks().onInit(runtime.sessionId, info); }
    const delta = translateDelta(event);
    if (delta) return hooks().onDelta(runtime.sessionId, delta);
    const task = readTaskEvent(event);
    if (task) {
      if (task.phase === 'ended') runtime.runningTasks.delete(task.id); else if (task.phase === 'started') runtime.runningTasks.add(task.id);
      hooks().onTask(runtime.sessionId, task);
      if (task.phase === 'ended') scheduleIdle(runtime);
    }
    if (event.type === 'system' && event.subtype === 'status' && event.permissionMode) {
      hooks().onModeChange(runtime.sessionId, event.permissionMode);
    }
    translateEvent(event).forEach(item => hooks().onItem(runtime.sessionId, item));
    // A correction that came too late for this turn makes the CLI start another: the turn ends after that one.
    if (event.type === 'result' && !corrections.holdTurn(runtime, event, () => endTurn(runtime))) endTurn(runtime);
  }

  function handleExit(runtime, info) {
    spare.forget(runtime);
    corrections.clear(runtime);
    clearTimeout(runtime.idleTimer);
    clearTimeout(runtime.interruptTimer);
    if (runtimes.get(runtime.sessionId) === runtime) runtimes.delete(runtime.sessionId);
    [...runtime.pending.keys()].forEach(id => permissions.resolvePermission(runtime, id));
    runtime.markExited();
    hooks().onExit(runtime.sessionId, { ...info, duringTurn: runtime.turnActive });
  }

  return { handleMessage, handleExit };
}

module.exports = { createRuntimeEvents };
