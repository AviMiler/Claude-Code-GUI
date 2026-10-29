/**
 * Per-session data for a pane, fetched without timers: on first use, again when the session's status changes
 * (a turn starts or ends), when another session is shown, or on demand. One request at a time per session.
 */

const fetchers = new Set(); // the entries of every fetcher, so a change made elsewhere can mark them old

/** Something changed the session's folder (a saved edit): the next draw of every pane fetches again. */
export function invalidateSessionFetches(sessionId) {
  fetchers.forEach(entries => { const entry = entries.get(sessionId); if (entry) entry.status = null; });
}

/**
 * @template T
 * @param {(sessionId:string)=>Promise<T>} load
 * @param {(error:Error)=>T} onError value to keep when the request fails
 * @returns {{get:(session:object, onReady:()=>void, force?:boolean)=>T|undefined}} get returns the last value at once;
 *   onReady runs when a new one arrived (the pane draws again)
 * @example const summaries = createSessionFetch(id => api.gitSummary(id), error => ({ isRepo: false })); summaries.get(session, redraw)
 */
export function createSessionFetch(load, onError) {
  const entries = new Map(); // session id -> { status, value, pending }
  let shownId = null;
  fetchers.add(entries);

  function get(session, onReady, force = false) {
    const switched = shownId !== session.id;
    shownId = session.id;
    const entry = entries.get(session.id);
    if (entry && !force && !switched && (entry.pending || entry.status === session.status)) return entry.value;
    if (entry?.pending) return entry.value;
    const next = { status: session.status, value: entry?.value, pending: true };
    entries.set(session.id, next);
    load(session.id).then(value => { next.value = value; }).catch(error => {
      console.error('[session-fetch] request failed:', error);
      next.value = onError(error);
    }).finally(() => { next.pending = false; onReady(); });
    return next.value;
  }

  return { get };
}
