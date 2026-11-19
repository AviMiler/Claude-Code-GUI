/** Routes of the Changes pane's one-hunk revert and whole-file discard. The folder is always the session's own; the body names only the hunk or the file. */
const { requireSession, requireRunnable } = require('../session-common');
const { revertHunk } = require('./hunk-revert');
const { discardFile } = require('./discard-file');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

const HUNK_ROUTES = [
  // body: { path, index, hash } (see hunk-revert.js); POST, so the server's Host / Origin guard covers it.
  route('POST', `/api/sessions/${ID}/revert-hunk`, async ({ params, body }) => revertHunk(requireRunnable(requireSession(params[0])), await body())),
  // body: { path, status, diffHash } (the pane's fileStates entry, see discard-states.js).
  route('POST', `/api/sessions/${ID}/discard-file`, async ({ params, body }) => discardFile(requireRunnable(requireSession(params[0])), await body())),
];

module.exports = { HUNK_ROUTES };
