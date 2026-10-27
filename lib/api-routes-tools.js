/**
 * API routes behind the GUI panels: CLI catalog and control requests, management subcommands,
 * Claude's own files, past transcripts, workspace views (files, git, the file viewer), and the user's prompt templates.
 */
const service = require('./session-service');
const catalog = require('./catalog-service');
const claudeFiles = require('./claude-files');
const transcripts = require('./transcripts');
const workspace = require('./workspace-info');
const { runCliCommand } = require('./cli-commands');
const { listModels } = require('./model-list');
const templates = require('./templates');
const { viewFile } = require('./file-view');
const { httpError } = require('./http-utils');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

/** Folder for a request: the session's folder when a session id is given, otherwise the given or default folder. */
function folderOf(config, { sessionId, cwd }) {
  if (sessionId) return service.requireSession(sessionId).cwd;
  return cwd || config.defaultCwd;
}

/** Writes never fall back to the default folder: a missing folder would silently land in the home folder. */
function explicitFolder(config, { sessionId, cwd }) {
  if (!sessionId && !cwd) throw httpError(400, 'חסרה תיקייה (sessionId או cwd) לכתיבה');
  return folderOf(config, { sessionId, cwd });
}

const TOOL_ROUTES = [
  route('GET', `/api/sessions/${ID}/catalog`, ({ config, params }) => catalog.getSessionCatalog(params[0], config)),
  route('POST', `/api/sessions/${ID}/control`, async ({ config, params, body }) => {
    const { subtype, ifRunning, ...payload } = await body();
    return catalog.sessionControl(params[0], subtype, payload, config, { ifRunning });
  }),
  route('GET', '/api/catalog', ({ config, query }) => catalog.getFolderCatalog(config, folderOf(config, query))),
  route('POST', '/api/control', async ({ config, body }) => {
    const { subtype, cwd, ...payload } = await body();
    return catalog.folderControl(config, folderOf(config, { cwd }), subtype, payload);
  }),

  route('GET', '/api/models', ({ config, query }) => listModels(config, { refresh: query.refresh === '1' })),

  route('POST', '/api/cli', async ({ config, body }) => runCliCommand(config, await body())),

  route('GET', '/api/claude-files', ({ config, query }) => claudeFiles.listAll(config, { cwd: folderOf(config, query) })),
  route('GET', '/api/claude-file', ({ config, query }) =>
    claudeFiles.readKind(config, { ...query, cwd: folderOf(config, query) })),
  route('PUT', '/api/claude-file', async ({ config, body }) => {
    const data = await body();
    return claudeFiles.writeKind(config, { ...data, cwd: explicitFolder(config, data) });
  }),
  route('DELETE', '/api/claude-file', ({ config, query }) =>
    claudeFiles.deleteKind(config, { ...query, cwd: explicitFolder(config, query) })),

  route('GET', '/api/transcripts', ({ config, query }) => transcripts.listTranscripts(config, { cwd: folderOf(config, query) })),
  route('POST', '/api/transcripts/import', async ({ config, body }) => {
    const { cwd, id, mode } = await body();
    const folder = folderOf(config, { cwd });
    const transcript = transcripts.transcriptItems(config, { cwd: folder, id });
    if (!transcript) throw httpError(404, 'השיחה לא נמצאה');
    return [201, service.createSession({
      name: transcript.title, cwd: folder, mode, claudeSessionId: id,
      items: [...transcript.items, { kind: 'divider', text: 'השיחה נטענה – אפשר להמשיך מכאן' }],
    }, config)];
  }),

  route('GET', '/api/file-view', ({ query }) => viewFile(query.sessionId, query.path)),
  route('GET', '/api/files', ({ config, query }) => workspace.searchFiles({ cwd: folderOf(config, query), q: query.q })),
  route('GET', '/api/git', ({ config, query }) => workspace.gitChanges({ cwd: folderOf(config, query) })),
  route('GET', '/api/folders', ({ config, query }) =>
    workspace.listFolders({ ...query, path: query.path || config.defaultCwd, fallback: !query.path })),
  route('POST', '/api/folders', async ({ body }) => [201, workspace.createFolder(await body())]),

  route('GET', '/api/templates', () => templates.list()),
  route('PUT', `/api/templates/${ID}`, async ({ params, body }) => templates.save(params[0], await body())),
  route('DELETE', `/api/templates/${ID}`, ({ params }) => { templates.remove(params[0]); return { ok: true }; }),
];

module.exports = { TOOL_ROUTES };
