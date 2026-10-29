/** Thin client for the server API. All user-facing errors come back as Error(message in Hebrew). */
async function request(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `שגיאה ${response.status}`);
  return data;
}

const query = params => new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString();

export const api = {
  state: () => request('GET', '/api/state'),
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
  clear: id => request('POST', `/api/sessions/${id}/clear`),
  fork: id => request('POST', `/api/sessions/${id}/fork`),
  /** Branch and uncommitted line counts of the session's folder: { isRepo, branch, files, untracked, added, removed }. */
  gitSummary: sessionId => request('GET', `/api/sessions/${sessionId}/git-summary`),
  /** The session folder's uncommitted diff against HEAD, new files included: { isRepo, diff, truncated, newFilesSkipped }. */
  sessionDiff: sessionId => request('GET', `/api/sessions/${sessionId}/diff`),
  /** Text of a file in the session's folders: { path, content, totalLines, truncated, size }. */
  viewFile: (sessionId, path) => request('GET', `/api/file-view?${query({ sessionId, path })}`),
  /** Prompt templates: [{ id, name, text, createdAt, updatedAt }], newest first. */
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

  transcripts: scope => request('GET', `/api/transcripts?${query(scope)}`),
  importTranscript: (cwd, id, mode) => request('POST', '/api/transcripts/import', { cwd, id, mode }),
  files: (scope, q) => request('GET', `/api/files?${query({ ...scope, q })}`),
  git: scope => request('GET', `/api/git?${query(scope)}`),
  folders: (path, hidden) => request('GET', `/api/folders?${query({ path, hidden: hidden ? '1' : '' })}`),
  createFolder: (path, name) => request('POST', '/api/folders', { path, name }),
};

/** Opens the live event stream. EventSource reconnects by itself; onOpen fires on every (re)connect. */
export function subscribe(onEvent, onOpen) {
  const source = new EventSource('/api/events');
  source.onmessage = message => onEvent(JSON.parse(message.data));
  source.onopen = onOpen;
}
