/** A rewind happened (the server's `rewound` event): the conversation on screen is cut, and what read the folder is fetched again. */
import { state } from '../state.js';
import { invalidateSessionFetches } from '../panes/session-fetch.js';

/**
 * @param {{sessionId:string, keep:number|null}} event keep: items that stay (null: only files changed)
 * @param {{thread:object, paneThread:(id:string)=>object|null, fetchContext:(id:string)=>void}} view
 */
export function applyRewound(event, view) {
  const session = state.sessions.get(event.sessionId);
  if (!session) return;
  invalidateSessionFetches(event.sessionId); // the Changes pane and the rail show the restored files
  if (event.keep === null) return;
  session.items = session.items.slice(0, event.keep);
  [event.sessionId === state.activeId ? view.thread : null, view.paneThread(event.sessionId)].filter(Boolean).forEach(thread => thread.show(session));
  view.fetchContext(event.sessionId);
}
