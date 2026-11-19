/** Routes of "merge into the project branch". Both take the session id only: the folders and branches are the session's own. */
const { requireSession } = require('../session-common');
const { mergeStatus } = require('./merge-status');
const { mergeIntoProject } = require('./merge');

const ID = '([\\w-]+)';
const route = (method, pattern, handler) => ({ method, pattern: new RegExp(`^${pattern}$`), handler });

const MERGE_ROUTES = [
  route('GET', `/api/sessions/${ID}/merge-status`, ({ params }) => mergeStatus(requireSession(params[0]))),
  route('POST', `/api/sessions/${ID}/merge-branch`, ({ params }) => mergeIntoProject(requireSession(params[0]))),
];

module.exports = { MERGE_ROUTES };
