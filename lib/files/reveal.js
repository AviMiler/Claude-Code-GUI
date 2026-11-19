/**
 * "Show in Explorer" and "open in an editor" for a file of a session. The path is resolved against the session's folders
 * like every file route (real path, inside a root, must exist); the editor comes from the config enum, never the request.
 */
const fs = require('fs');
const { spawn } = require('child_process');
const { requireSession, requireRunnable } = require('../session-common');
const { httpError } = require('../http-utils');
const { rootsOf, resolveInside } = require('./safe-path');
const { buildEditorLaunch, buildRevealLaunch, launch } = require('./editors');

/** The real path of the requested file or folder, and whether it is a folder. */
function resolveTarget(session, requested) {
  const target = resolveInside(rootsOf(session), session.cwd, requested);
  return { target, isDir: fs.statSync(target).isDirectory() };
}

/**
 * Shows the file in the system file manager.
 * @param {object} session from the store @param {{path:string}} request @param {{spawn?:Function, platform?:string}} [deps] injectable for tests
 * @returns {Promise<{ok:true}>}
 */
async function revealInExplorer(session, { path: requested } = {}, deps = {}) {
  const { target, isDir } = resolveTarget(session, requested);
  await launch(deps.spawn || spawn, buildRevealLaunch({ target, isDir }, deps.platform));
  return { ok: true };
}

/**
 * Opens the file in the editor named by config.editor (an enum; see editors.js).
 * @param {object} session @param {{path:string}} request @param {{editor?:string}} config
 * @param {{spawn?:Function, platform?:string, env?:object, exists?:Function}} [deps]
 * @returns {Promise<{ok:true, editor:string}>}
 */
async function openInEditor(session, { path: requested } = {}, config = {}, deps = {}) {
  const { target, isDir } = resolveTarget(session, requested);
  const plan = buildEditorLaunch({ editor: config.editor, target, isDir }, deps);
  await launch(deps.spawn || spawn, plan);
  return { ok: true, editor: plan.editor };
}

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });
const readable = id => requireRunnable(requireSession(id));
const bodyOf = async body => { const value = await body(); if (!value || typeof value !== 'object') throw httpError(400, 'בקשה לא תקינה'); return value; };

const REVEAL_ROUTES = [
  route('POST', `/api/sessions/${ID}/reveal`, async ({ params, body }) => revealInExplorer(readable(params[0]), await bodyOf(body))),
  route('POST', `/api/sessions/${ID}/open-in-editor`, async ({ params, body, config }) => openInEditor(readable(params[0]), await bodyOf(body), config)),
];

module.exports = { revealInExplorer, openInEditor, REVEAL_ROUTES };
