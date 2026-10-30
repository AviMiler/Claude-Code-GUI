/**
 * API routes behind the GUI panels: CLI catalog and control requests, management subcommands,
 * Claude's own files, past transcripts, workspace views (files, git, the file viewer), and the user's prompt templates.
 */
const fs = require('fs');
const service = require('./session-service');
const catalog = require('./catalog-service');
const claudeFiles = require('./claude-files');
const transcripts = require('./transcripts/transcript-files');
const workspace = require('./workspace-info');
const { gitChanges, gitSummary } = require('./git/changes');
const { sessionDiff } = require('./git/session-diff');
const { probeWorktree } = require('./git/worktree');
const { runCliCommand } = require('./cli-commands');
const { listModels } = require('./model-list');
const { checkModelServer } = require('./model-health');
const templates = require('./templates/template-store');
const { listConversations } = require('./transcripts/conversation-index');
const { searchConversations } = require('./transcripts/conversation-search');
const { viewFile } = require('./file-view');
const { httpError } = require('./http-utils');
const store = require('./session-store');
const { pushExtra, withItems } = require('./session-common');

const ID = '([\\w-]+)';
const COMMAND = '(\\w[\\w.-]*)'; // a template is a CLI command file: its name may hold a dot
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

/** The CLI conversations GUI sessions hold, archived ones too: they are the GUI's rows, not light rows. */
const heldConversations = () => new Set(store.list().flatMap(session => [session.claudeSessionId, ...(session.conversations || [])]).filter(Boolean));

/** A git view of the session's own folder; an archived session's removed worktree is "missing", not an error. */
function sessionGit(sessionId, read) {
  const session = service.requireSession(sessionId);
  return fs.existsSync(session.cwd) ? read({ cwd: session.cwd }) : { isRepo: false, folderMissing: true, archived: Boolean(session.archived) };
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
  route('GET', '/api/model-health', ({ config, query }) => checkModelServer(config, { refresh: query.refresh === '1' })),

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
  // Every CLI conversation no GUI session holds, for the sidebar's light rows (no parameters: a GET is not origin-checked).
  route('GET', '/api/cli-conversations', ({ config }) => {
    const { rows, total } = listConversations(config, heldConversations());
    return { rows: rows.map(({ file, ...row }) => row), total };
  }),
  // POST: reads every file, so it is origin-checked like every write.
  route('POST', '/api/cli-conversations/search', async ({ config, body }) => searchConversations(config, heldConversations(), (await body()).query)),
  route('POST', '/api/transcripts/import', async ({ config, body }) => {
    const { cwd, id, mode } = await body();
    // A second click or another tab: the session that already holds it, not a second one.
    const holder = store.list().find(session => session.claudeSessionId === id || (session.conversations || []).includes(id));
    if (holder) return [200, withItems(holder)];
    const folder = folderOf(config, { cwd });
    const titles = transcripts.readTitles(config, { cwd: folder, id });
    if (!titles) throw httpError(404, 'השיחה לא נמצאה');
    // Shown from the CLI's file like every session; the divider goes after its last line.
    const session = service.createSession({ name: titles.custom || titles.auto || '(ללא כותרת)', cwd: folder, mode, claudeSessionId: id }, config);
    pushExtra(session.id, { kind: 'divider', text: 'השיחה נטענה – אפשר להמשיך מכאן' });
    return [201, withItems(store.get(session.id))];
  }),

  route('GET', '/api/file-view', ({ query }) => viewFile(query.sessionId, query.path)),
  route('GET', '/api/files', ({ config, query }) => workspace.searchFiles({ cwd: folderOf(config, query), q: query.q })),
  route('GET', '/api/git', ({ config, query }) => gitChanges({ cwd: folderOf(config, query) })),
  // The session's own folder only (no cwd parameter): read by the session details rail.
  route('GET', `/api/sessions/${ID}/git-summary`, ({ params }) => sessionGit(params[0], gitSummary)),
  route('GET', `/api/sessions/${ID}/diff`, ({ params }) => sessionGit(params[0], sessionDiff)),
  // POST (origin-checked like every write), not GET: the welcome page asks before a session exists.
  route('POST', '/api/worktree/probe', async ({ config, body }) => {
    const { cwd } = await body();
    if (cwd !== undefined && typeof cwd !== 'string') throw httpError(400, 'תיקייה לא תקינה');
    return probeWorktree({ cwd: folderOf(config, { cwd }) });
  }),
  route('GET', '/api/folders', ({ config, query }) =>
    workspace.listFolders({ ...query, path: query.path || config.defaultCwd, fallback: !query.path })),
  route('POST', '/api/folders', async ({ body }) => [201, workspace.createFolder(await body())]),

  route('GET', '/api/templates', ({ config }) => templates.list(config)),
  route('PUT', `/api/templates/${COMMAND}`, async ({ config, params, body }) => templates.save(config, params[0], await body())),
  route('DELETE', `/api/templates/${COMMAND}`, ({ config, params }) => { templates.remove(config, params[0]); return { ok: true }; }),
];

module.exports = { TOOL_ROUTES };
