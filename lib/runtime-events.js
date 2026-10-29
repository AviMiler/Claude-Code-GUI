/**
 * What a session's CLI process reports (session-runtime.js): events become items, deltas, task and mode updates for
 * the session hooks; a result ends the turn (unless a late correction holds it, runtime-corrections.js); an exit cleans up.
 * A result waits for its cost from the CLI (runtime-cost.js, up to 2 s); what the process reports meanwhile, its exit
 * included, is handled after it, in order.
 */
const { translateEvent, translateDelta, readInit, readTaskEvent } = require('./event-translator');
const corrections = require('./runtime-corrections');
const { turnCost } = require('./runtime-cost');

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

  /** Runs `step` after what is still waiting for this runtime (a result's cost), or now when nothing is. */
  function inOrder(runtime, step) {
    if (!runtime.waiting) {
      const pending = step();
      if (!pending) return;
      runtime.waiting = pending;
    } else {
      runtime.waiting = runtime.waiting.then(step);
    }
    const mine = runtime.waiting.catch(error => console.error('[runtime-events] event not handled:', error));
    runtime.waiting = mine;
    mine.then(() => { if (runtime.waiting === mine) runtime.waiting = null; });
  }

  const handleMessage = (runtime, event) => inOrder(runtime, () => handleNow(runtime, event));

  /** @returns {Promise|undefined} a promise while a result waits for its cost */
  function handleNow(runtime, event) {
    // A late correction's next turn after the hold gave up: the session is working again.
    if (corrections.noteEvent(runtime, event) && !runtime.turnActive) { runtime.turnActive = true; hooks().onTurnResume(runtime.sessionId); }
    if (event.session_id) hooks().onSessionId(runtime.sessionId, event.session_id);
    // The CLI took a message in (replay) or answered (assistant): the points a rewind can go back to (rewind/).
    if (event.type === 'user' && event.isReplay && event.uuid) hooks().onUserReplay(runtime.sessionId, event.uuid, event.session_id);
    if (event.type === 'assistant' && !event.parent_tool_use_id && event.uuid) hooks().onAssistantUuid(runtime.sessionId, event.uuid, event.session_id);
    // A line of the CLI's conversation file: what the GUI adds next is placed after it (history-build.js).
    if ((event.type === 'user' || event.type === 'assistant') && !event.parent_tool_use_id && event.uuid) hooks().onLineUuid(runtime.sessionId, event.uuid);
    const info = readInit(event);
    if (info) { runtime.info = info; hooks().onInit(runtime.sessionId, info); }
    const delta = translateDelta(event);
    if (delta) return void hooks().onDelta(runtime.sessionId, delta);
    const task = readTaskEvent(event);
    if (task) {
      if (task.phase === 'ended') runtime.runningTasks.delete(task.id); else if (task.phase === 'started') runtime.runningTasks.add(task.id);
      hooks().onTask(runtime.sessionId, task);
      if (task.phase === 'ended') scheduleIdle(runtime);
    }
    if (event.type === 'system' && event.subtype === 'status' && event.permissionMode) {
      hooks().onModeChange(runtime.sessionId, event.permissionMode);
    }
    const items = translateEvent(event);
    if (event.type !== 'result') return void items.forEach(item => hooks().onItem(runtime.sessionId, item, event));
    return turnCost(runtime, event).then(costUsd => {
      items.forEach(item => hooks().onItem(runtime.sessionId, item.kind === 'result' ? { ...item, costUsd } : item, event));
      // A correction that came too late for this turn makes the CLI start another: the turn ends after that one.
      if (!corrections.holdTurn(runtime, event, () => endTurn(runtime))) endTurn(runtime);
    });
  }

  const handleExit = (runtime, info) => inOrder(runtime, () => exitNow(runtime, info));

  function exitNow(runtime, info) {
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
