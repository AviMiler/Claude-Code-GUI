/** Thin client for the server API. All user-facing errors come back as Error(message in Hebrew). */
import { scheduleApi } from './schedule/schedule-api.js';

async function request(method, url, body, { keepalive = false } = {}) {
  const response = await fetch(url, {
    method,
    // X-Claude-Gui: a custom header the server requires on every API call; another site's page cannot send it (lib/http-utils.js).
    headers: { 'X-Claude-Gui': '1', ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
    keepalive, // lets a save sent while the page unloads finish (files/auto-save.js)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `שגיאה ${response.status}`), { status: response.status });
  return data;
}

const query = params => new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString();

export const api = {
  /** Every session's metadata (no items), the config and the CLI's capabilities. */
  state: () => request('GET', '/api/state'),
  /** A session's items: all, or with rev + since only the new ones: { rev, from, items, total, full } (lib/sync/item-revision.js). */
  items: (id, rev, since) => request('GET', `/api/sessions/${id}/items?${query({ rev, since: rev ? String(since) : '' })}`),
  /** The sessions this tab views: the event stream sends their item-level events only. */
  subscribeEvents: (client, sessions) => request('POST', '/api/events/subscribe', { client, sessions }),
  /** The text of every GUI session: { query, hits: { [sessionId]: { count, indexes, snippet } } }. */
  searchSessions: query => request('POST', '/api/search/sessions', { query }),
  /** Starts the CLI ahead of the message being typed: { sessionId } or the draft { cwd, mode, model, effort }. */
  warm: target => request('POST', '/api/warm', target),
  /** Models of the system: { source: 'cli'|'server', models, current, error }. */
  models: () => request('GET', '/api/models'),
  /** Is the model server up? { state: 'up'|'down'|'unknown', latencyMs, error, url, checkedAt }. */
  modelHealth: refresh => request('GET', `/api/model-health${refresh ? '?refresh=1' : ''}`),
  createSession: body => request('POST', '/api/sessions', body),
  updateSession: (id, body) => request('PATCH', `/api/sessions/${id}`, body),
  /** removeWorktree: also remove the session's worktree folder (its branch stays). @returns {Promise<{worktreeRemoved:boolean, worktreeError?:string}>} */
  deleteSession: (id, { removeWorktree = false } = {}) => request('DELETE', `/api/sessions/${id}${removeWorktree ? '?worktree=remove' : ''}`),
  /** @returns {Promise<{isRepo:boolean, hasCommits?:boolean, branch?:string}>} can this folder get a worktree */
  probeWorktree: cwd => request('POST', '/api/worktree/probe', { cwd }),
  /** @returns {Promise<{worktreeRemoved:boolean, worktreeError?:string}>} archiving also removes a clean worktree */
  archive: id => request('POST', `/api/sessions/${id}/archive`),
  unarchive: id => request('POST', `/api/sessions/${id}/unarchive`),
  /**
   * images / files: [{ data, mediaType?, name }] or [{ ref, name }] (see attachments.js forServer). delivery while the
   * session works: 'correct' joins the running turn, 'queue' (or nothing) waits for its end.
   * @returns {Promise<{ok:boolean, queued:boolean, corrected?:boolean}>}
   */
  sendMessage: (id, text, images, files, delivery) => request('POST', `/api/sessions/${id}/messages`,
    { text, ...(images?.length && { images }), ...(files?.length && { files }), ...(delivery && { delivery }) }),
  /** @returns {Promise<{stopped:boolean, queued:string[]}>} queued: messages taken off the queue by the stop. */
  stop: id => request('POST', `/api/sessions/${id}/stop`),
  removeQueued: (id, queueId) => request('DELETE', `/api/sessions/${id}/queue/${queueId}`),
  resumeQueue: id => request('POST', `/api/sessions/${id}/queue/resume`),
  /** Runs a shell command in the session's folder (output arrives as `shell` events): source 'terminal' (the pane) or 'bang' (a `!` line). */
  runShell: (id, command, source, shell) => request('POST', `/api/sessions/${id}/shell`, { command, source, ...(shell && { shell }) }),
  stopShell: id => request('POST', `/api/sessions/${id}/shell/stop`),
  /** The automatic check of the session's project folder (verify loop, run by the CLI's Stop hook). */
  verifyCheck: id => request('GET', `/api/sessions/${id}/verify-check`),
  saveVerifyCheck: (id, check) => request('PUT', `/api/sessions/${id}/verify-check`, check),
  clearVerifyCheck: id => request('DELETE', `/api/sessions/${id}/verify-check`),
  /** What going back to a user message (its cliUuid) would do: { text, conversation, code: { available, reason, files, insertions, deletions }, runningTasks }. */
  rewindPreview: (id, uuid) => request('POST', `/api/sessions/${id}/rewind/preview`, { uuid }),
  /** mode: 'conversation' | 'code' | 'both'. @returns {Promise<{text:string, images:object[], files:object[], mode:string}>} the message, for the composer */
  rewind: (id, uuid, mode) => request('POST', `/api/sessions/${id}/rewind`, { uuid, mode }),
  clear: id => request('POST', `/api/sessions/${id}/clear`),
  fork: id => request('POST', `/api/sessions/${id}/fork`),
  /** Branch and uncommitted line counts of the session's folder: { isRepo, branch, files, untracked, added, removed }. */
  gitSummary: sessionId => request('GET', `/api/sessions/${sessionId}/git-summary`),
  /** The real context window of the session's model: { window, source, estimate, model, warnPercent } (lib/context/). */
  contextWindow: sessionId => request('GET', `/api/sessions/${sessionId}/context-window`),
  /** The session folder's uncommitted diff against HEAD, new files included: { isRepo, diff, truncated, newFilesSkipped }. */
  sessionDiff: sessionId => request('GET', `/api/sessions/${sessionId}/diff`),
  /** Text of a file in the session's folders: { path, content, totalLines, truncated, size }. */
  viewFile: (sessionId, path) => request('GET', `/api/file-view?${query({ sessionId, path })}`),
  /** One folder level of the session folder (dir relative to it): { dir, entries: [{ name, type: 'dir'|'file', blocked? }], truncated }. */
  treeDir: (sessionId, dir, hidden) => request('GET', `/api/sessions/${sessionId}/tree?${query({ dir, hidden: hidden ? '1' : '' })}`),
  /** A file for the editor: { path, rel, content (LF), eol, bom, hash, size, mtimeMs, writable, readOnlyReason }. */
  openFile: (sessionId, path) => request('GET', `/api/sessions/${sessionId}/file?${query({ path })}`),
  /** Saves an edit; status 412 (error.status) when the file changed on disk since it was opened. @returns {Promise<{hash, size, mtimeMs}>} */
  saveFile: (sessionId, edit, options) => request('PUT', `/api/sessions/${sessionId}/file`, edit, options),
  /** Shows a file of the session in the system file manager / opens it in the editor chosen by config.editor (lib/files/reveal.js). */
  revealFile: (sessionId, path) => request('POST', `/api/sessions/${sessionId}/reveal`, { path }),
  openInEditor: (sessionId, path) => request('POST', `/api/sessions/${sessionId}/open-in-editor`, { path }),
  /** Reverts one hunk of the Changes pane: { path, index, hash } (hunk-hash.js); 409 when it changed since or is refused. */
  revertHunk: (sessionId, hunk) => request('POST', `/api/sessions/${sessionId}/revert-hunk`, hunk),
  /** Commit box data: { isRepo, branch, upstream, ahead, files, canCommit, commitReason, canPush, pushReason, canPushNewUpstream, … } (lib/git/commit-status.js). */
  commitStatus: sessionId => request('GET', `/api/sessions/${sessionId}/git/status`),
  /** { message, paths, push?, setUpstream? } -> { hash, branch, pushed, pushOutput?, pushError? }; a 409 carries git's text in error.message. */
  commitChanges: (sessionId, commit) => request('POST', `/api/sessions/${sessionId}/git/commit`, commit),
  pushBranch: (sessionId, push) => request('POST', `/api/sessions/${sessionId}/git/push`, push),
  /**
   * Prompt templates = the user's CLI commands: [{ id (command name), name, text ({{variables}}), expands, updatedAt }],
   * newest first. saveTemplate(name, { description, text, create, previous }): previous = the name it had (a rename).
   */
  templates: () => request('GET', '/api/templates'),
  saveTemplate: (id, template) => request('PUT', `/api/templates/${id}`, template),
  deleteTemplate: id => request('DELETE', `/api/templates/${id}`),
  sideQuestion: (id, question, history) => request('POST', `/api/sessions/${id}/side-question`, { question, history }),
  answerPermission: (id, requestId, answer) => request('POST', `/api/sessions/${id}/permissions/${requestId}`, answer),

  /** Catalog of commands/skills/agents/models: from the session's process, or a folder probe without a session. */
  catalog: ({ sessionId, cwd }) => (sessionId
    ? request('GET', `/api/sessions/${sessionId}/catalog`)
    : request('GET', `/api/catalog?${query({ cwd })}`)),
  /** Control request (get_context_usage, mcp_status, mcp_toggle, ...). */
  control: ({ sessionId, cwd }, subtype, payload = {}) => (sessionId
    ? request('POST', `/api/sessions/${sessionId}/control`, { subtype, ...payload })
    : request('POST', '/api/control', { subtype, cwd, ...payload })),
  /** Whitelisted `claude <args>` management command. */
  cli: (args, cwd) => request('POST', '/api/cli', { args, cwd }),

  claudeFiles: scope => request('GET', `/api/claude-files?${query(scope)}`),
  readClaudeFile: (scope, kind, name) => request('GET', `/api/claude-file?${query({ ...scope, kind, name })}`),
  writeClaudeFile: (scope, kind, name, content) => request('PUT', '/api/claude-file', { ...scope, kind, name, content }),
  deleteClaudeFile: (scope, kind, name) => request('DELETE', `/api/claude-file?${query({ ...scope, kind, name })}`),

  /** Hooks of the three settings files of a session's folder: { files, hooks }; add / update / delete write one hook (lib/hooks). */
  hooks: id => request('GET', `/api/sessions/${id}/hooks`),
  addHook: (id, hook) => request('POST', `/api/sessions/${id}/hooks`, hook),
  updateHook: (id, hook) => request('PUT', `/api/sessions/${id}/hooks`, hook),
  deleteHook: (id, { scope, event, groupIndex, hookIndex, command, matcher }) => request('DELETE', `/api/sessions/${id}/hooks?${new URLSearchParams({ scope, event, groupIndex, hookIndex, command, matcher })}`),

  transcripts: scope => request('GET', `/api/transcripts?${query(scope)}`),
  importTranscript: (cwd, id, mode) => request('POST', '/api/transcripts/import', { cwd, id, mode }),
  /** Every CLI conversation no session holds: { rows: [{ id, cwd, title, updatedAt, sizeBytes }], total } (newest 500). */
  cliConversations: () => request('GET', '/api/cli-conversations'),
  /** Full text over those conversations: { hits: [{ id, cwd, title, updatedAt, count, snippet }], scanned, total, partial }. */
  searchCliConversations: query => request('POST', '/api/cli-conversations/search', { query }),
  files: (scope, q) => request('GET', `/api/files?${query({ ...scope, q })}`),
  git: scope => request('GET', `/api/git?${query(scope)}`),
  schedule: scheduleApi(request), // local scheduled tasks (schedule/schedule-api.js)
  folders: (path, hidden) => request('GET', `/api/folders?${query({ path, hidden: hidden ? '1' : '' })}`),
  createFolder: (path, name) => request('POST', '/api/folders', { path, name }),
};

/**
 * Opens the live event stream. EventSource reconnects by itself and the server replays what was missed (lib/event-hub.js).
 * onOpen (load the whole state) fires on the first connect, on a reconnect before any event was seen, and when the
 * server says `resync` (the missed events are no longer available). onConnect fires on every (re)connect: the tab
 * subscribes to the sessions it views again and fetches what it may have missed of them (sync/item-sync.js).
 * @param {string} client this tab's id, so the server knows which sessions it views
 */
export function subscribe(onEvent, onOpen, onConnect = () => {}, client = '') {
  const source = new EventSource(`/api/events${client ? `?client=${encodeURIComponent(client)}` : ''}`);
  let seen = false;
  source.onmessage = message => { seen = true; onEvent(JSON.parse(message.data)); };
  source.onopen = () => { if (!seen) onOpen(); else onConnect(); };
  source.addEventListener('resync', () => { seen = true; onOpen(); });
}
