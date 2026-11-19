/** GET /api/worktrees (the cleanup list) and POST /api/worktrees/remove { path }: the path must be an entry of a fresh list. */
const { listWorktrees } = require('./worktree-list');
const { removeListedWorktree } = require('./worktree-cleanup');

const WORKTREE_ROUTES = [
  { method: 'GET', pattern: /^\/api\/worktrees$/, handler: () => listWorktrees() },
  { method: 'POST', pattern: /^\/api\/worktrees\/remove$/, handler: async ({ body }) => removeListedWorktree((await body()).path) },
];

module.exports = { WORKTREE_ROUTES };
