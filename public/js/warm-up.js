/** Work done ahead of the user: start Claude Code while a message is typed, and fetch the catalog before a menu opens. */
import { api } from './api.js';
import { state, activeSession, currentScope, getCatalog } from './state.js';
import { worktreeLikely } from './worktree/worktree-toggle.js';

const WARM_REPEAT_MS = 60000;
const PREFETCH_DELAY_MS = 800;
let lastWarm = { key: '', at: 0 };
let prefetchTimer = null;

/** Starting Claude Code takes seconds; it starts while the first words are typed, so Enter does not wait for it. */
export function warmUp() {
  const session = activeSession();
  if (session?.status === 'running' || session?.archived) return; // an archived one may have lost its worktree folder
  // A new session in its own worktree runs in a folder that does not exist yet: a process warmed here would go unused.
  if (!session && worktreeLikely(state.draft.cwd || state.config.defaultCwd)) return;
  const { draft } = state;
  const target = session ? { sessionId: session.id }
    : { cwd: draft.cwd || state.config.defaultCwd, mode: draft.mode, model: draft.model, effort: draft.effort };
  const key = JSON.stringify(target);
  if (key === lastWarm.key && Date.now() - lastWarm.at < WARM_REPEAT_MS) return;
  lastWarm = { key, at: Date.now() };
  api.warm(target).catch(() => {});
}

/** Menus read the catalog from cache; fetch it shortly after a view settles, not when a menu opens. */
export function prefetchCatalog() {
  clearTimeout(prefetchTimer);
  const scope = currentScope();
  prefetchTimer = setTimeout(() => { if (JSON.stringify(scope) === JSON.stringify(currentScope())) getCatalog(scope); }, PREFETCH_DELAY_MS);
}
