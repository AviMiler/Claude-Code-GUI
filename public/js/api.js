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
  createSession: body => request('POST', '/api/sessions', body),
  updateSession: (id, body) => request('PATCH', `/api/sessions/${id}`, body),
  deleteSession: id => request('DELETE', `/api/sessions/${id}`),
  /** @returns {Promise<{ok:boolean, queued:boolean}>} queued: the session was busy, the message waits in its queue. */
  /** images / files: [{ data, mediaType?, name }] or [{ ref, name }] (see attachments.js forServer). */
  sendMessage: (id, text, images, files) => request('POST', `/api/sessions/${id}/messages`,
    { text, ...(images?.length && { images }), ...(files?.length && { files }) }),
  /** @returns {Promise<{stopped:boolean, queued:string[]}>} queued: messages taken off the queue by the stop. */
  stop: id => request('POST', `/api/sessions/${id}/stop`),
  removeQueued: (id, queueId) => request('DELETE', `/api/sessions/${id}/queue/${queueId}`),
  resumeQueue: id => request('POST', `/api/sessions/${id}/queue/resume`),
  clear: id => request('POST', `/api/sessions/${id}/clear`),
  fork: id => request('POST', `/api/sessions/${id}/fork`),
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
