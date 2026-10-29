/** Routes of the Files pane: a folder level, a file's text, and saving it. No model call; Claude is not told about an edit. */
const { requireSession, requireRunnable } = require('../session-common');
const { httpError } = require('../http-utils');
const { listDirectory } = require('./file-tree');
const { openFile } = require('./file-open');
const { saveFile } = require('./file-save');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

/** A session whose folder is there (an archived one may be read, never changed). */
const readable = id => requireRunnable(requireSession(id));

function writable(id) {
  const session = readable(id);
  if (session.archived) throw httpError(409, 'הסשן בארכיון. שחזר אותו כדי לערוך קבצים.');
  return session;
}

const FILES_ROUTES = [
  route('GET', `/api/sessions/${ID}/tree`, ({ params, query }) => listDirectory(readable(params[0]), query.dir || '', { showHidden: query.hidden === '1' })),
  route('GET', `/api/sessions/${ID}/file`, ({ params, query }) => openFile(readable(params[0]), query.path)),
  route('PUT', `/api/sessions/${ID}/file`, async ({ params, body }) => saveFile(writable(params[0]), await body())),
];

module.exports = { FILES_ROUTES };
