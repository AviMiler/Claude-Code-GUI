/**
 * Applies one server event (SSE) to the client state and the views. Every live update flows through here,
 * including the user's notifications (notify.js) for a finished, waiting or failed turn.
 * Event types come from lib/session-service.js: session, removed, item, status, delta, runtime, permission, permission-resolved, tasks.
 */
import { state, forgetCatalog } from './state.js';
import { notify } from './notify.js';

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
  while (start > 0 && items[start - 1].kind !== 'user') start -= 1;
  const turn = items.slice(start);
  if (turn.some(item => item.kind === 'notice' && item.stopped)) return null;
  return turn.some(item => item.kind === 'error' || (item.kind === 'result' && item.isError)) ? 'error' : 'done';
}

/**
 * @param {{type:string, sessionId?:string}} event
 * @param {{thread:object, refresh:()=>void, selectSession:(id:string|null)=>void, fetchContext:(id:string)=>void}} view
 */
export function handleEvent(event, view) {
  const session = event.sessionId ? state.sessions.get(event.sessionId) : null;
  const isActive = event.sessionId && event.sessionId === state.activeId;

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
      if (isActive) view.thread.append(event.item, session.items.length - 1, session.items);
      if (event.item.kind === 'divider' || event.item.kind === 'command-output') view.fetchContext(event.sessionId);
      break;
    case 'delta':
      if (isActive) view.thread.delta(event);
      return undefined; // no other view depends on streaming text
    case 'status':
      if (!session) return undefined;
      session.status = event.status;
      if (event.status === 'running') session.turnStartedAt = Date.now();
      if (isActive) view.thread.setRunning(event.status === 'running', { startedAt: session.turnStartedAt });
      if (event.status === 'idle') {
        if (!isActive || document.hidden) state.unread.add(event.sessionId);
        view.fetchContext(event.sessionId);
        const outcome = turnOutcome(session);
        if (outcome) notify(outcome, session, { activeId: state.activeId, onOpen: view.selectSession });
      }
      break;
    case 'runtime':
      state.runtime.set(event.sessionId, event.info);
      if (isActive) view.thread.activity(); // the CLI is up and working on the turn
      break;
    case 'permission':
      if (!session) return undefined;
      if (!(session.pendingPermissions || []).some(p => p.requestId === event.prompt.requestId)) {
        notify('waiting', session, { activeId: state.activeId, onOpen: view.selectSession });
      }
      session.pendingPermissions = [...(session.pendingPermissions || []).filter(p => p.requestId !== event.prompt.requestId), event.prompt];
      if (isActive) view.thread.setRunning(true, { startedAt: session.turnStartedAt, waiting: true });
      break;
    case 'tasks':
      if (!session) return undefined;
      session.tasks = event.tasks;
      window.dispatchEvent(new CustomEvent(TASKS_EVENT, { detail: { sessionId: event.sessionId } })); // an open tasks panel redraws
      break;
    case 'permission-resolved':
      if (!session) return undefined;
      session.pendingPermissions = (session.pendingPermissions || []).filter(prompt => prompt.requestId !== event.requestId);
      if (isActive && session.status === 'running') {
        view.thread.setRunning(true, { startedAt: session.turnStartedAt, waiting: session.pendingPermissions.length > 0 });
      }
      break;
    default:
      return undefined;
  }
  view.refresh();
  return undefined;
}

