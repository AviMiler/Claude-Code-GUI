/**
 * Applies one server event (SSE) to the client state and the views. Every live update flows through here,
 * including the user's notifications (notify.js) for a finished, waiting or failed turn.
 * Event types come from lib/session-service.js: session, removed, item, status, delta, runtime, permission, permission-resolved, tasks.
 */
import { state, forgetCatalog } from './state.js';
import { notify } from './notify.js';
import { isTurnStart } from './turn-stats.js';

/** Window event fired when a session's background tasks change (panels/panel-tasks.js listens while open). */
export const TASKS_EVENT = 'claude-gui:tasks';

function mergeSession(update) {
  const existing = state.sessions.get(update.id);
  state.sessions.set(update.id, { items: [], ...existing, ...update });
}

/**
 * How the turn that just ended went, from the items after the last user message.
 * @returns {'done'|'error'|null} null when the user stopped it (nothing to tell them)
 */
function turnOutcome(session) {
  const items = session.items;
  let start = items.length;
  while (start > 0 && !isTurnStart(items[start - 1])) start -= 1;
  const turn = items.slice(start);
  if (turn.some(item => item.kind === 'notice' && item.stopped)) return null;
  return turn.some(item => item.kind === 'error' || (item.kind === 'result' && item.isError)) ? 'error' : 'done';
}

/**
 * @param {{type:string, sessionId?:string}} event
 * @param {{thread:object, refresh:()=>void, selectSession:(id:string|null)=>void, fetchContext:(id:string)=>void,
 *   onTurnFailed:()=>void, paneThread:(sessionId:string)=>object|null}} view paneThread: the split pane's thread
 *   when it shows this session (split-view.js)
 */
export function handleEvent(event, view) {
  const session = event.sessionId ? state.sessions.get(event.sessionId) : null;
  const isActive = event.sessionId && event.sessionId === state.activeId;
  // Every thread on screen that shows this session: the main one and/or the split pane.
  const threads = [isActive ? view.thread : null, view.paneThread(event.sessionId)].filter(Boolean);
  const onScreen = threads.length > 0;

  switch (event.type) {
    case 'session':
      mergeSession(event.session);
      break;
    case 'removed':
      state.sessions.delete(event.sessionId);
      forgetCatalog({ sessionId: event.sessionId });
      if (isActive) return view.selectSession(null);
      break;
    case 'item':
      if (!session) return undefined;
      session.items.push(event.item);
      session.updatedAt = Date.now();
      threads.forEach(thread => thread.append(event.item, session.items.length - 1, session.items));
      if (event.item.kind === 'divider' || event.item.kind === 'command-output') view.fetchContext(event.sessionId);
      break;
    case 'delta':
      threads.forEach(thread => thread.delta(event));
      return undefined; // no other view depends on streaming text
    case 'status':
      if (!session) return undefined;
      session.status = event.status;
      if (event.status === 'running') session.turnStartedAt = Date.now();
      threads.forEach(thread => thread.setRunning(event.status === 'running', { startedAt: session.turnStartedAt }));
      if (event.status === 'idle') {
        if ((!onScreen || document.hidden) && !session.archived) state.unread.add(event.sessionId); // an archived turn was stopped
        view.fetchContext(event.sessionId);
        const outcome = turnOutcome(session);
        if (outcome) notify(outcome, session, { onScreen, onOpen: view.selectSession });
        if (outcome === 'error') view.onTurnFailed(); // was it the model server? (model-health.js)
      }
      break;
    case 'runtime':
      state.runtime.set(event.sessionId, event.info);
      threads.forEach(thread => thread.activity()); // the CLI is up and working on the turn
      break;
    case 'permission':
      if (!session) return undefined;
      if (!(session.pendingPermissions || []).some(p => p.requestId === event.prompt.requestId)) {
        notify('waiting', session, { onScreen, onOpen: view.selectSession });
      }
      session.pendingPermissions = [...(session.pendingPermissions || []).filter(p => p.requestId !== event.prompt.requestId), event.prompt];
      threads.forEach(thread => thread.setRunning(true, { startedAt: session.turnStartedAt, waiting: true }));
      break;
    case 'tasks':
      if (!session) return undefined;
      session.tasks = event.tasks;
      window.dispatchEvent(new CustomEvent(TASKS_EVENT, { detail: { sessionId: event.sessionId } })); // an open tasks panel redraws
      break;
    case 'permission-resolved':
      if (!session) return undefined;
      session.pendingPermissions = (session.pendingPermissions || []).filter(prompt => prompt.requestId !== event.requestId);
      if (session.status === 'running') {
        threads.forEach(thread => thread.setRunning(true, { startedAt: session.turnStartedAt, waiting: session.pendingPermissions.length > 0 }));
      }
      break;
    default:
      return undefined;
  }
  view.refresh();
  return undefined;
}

