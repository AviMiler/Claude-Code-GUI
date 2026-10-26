/**
 * Applies one server event (SSE) to the client state and the views. Every live update flows through here.
 * Event types come from lib/session-service.js: session, removed, item, status, delta, runtime, permission, permission-resolved.
 */
import { state, forgetCatalog } from './state.js';

function mergeSession(update) {
  const existing = state.sessions.get(update.id);
  state.sessions.set(update.id, { items: [], ...existing, ...update });
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
      if (isActive) view.thread.append(event.item);
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
      }
      break;
    case 'runtime':
      state.runtime.set(event.sessionId, event.info);
      break;
    case 'permission':
      if (!session) return undefined;
      session.pendingPermissions = [...(session.pendingPermissions || []).filter(p => p.requestId !== event.prompt.requestId), event.prompt];
      if (isActive) view.thread.setRunning(true, { startedAt: session.turnStartedAt, waiting: true });
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

