/** What the Plan pane shows, read from a session's items: the latest plan Claude proposed and its latest todo list. */

/**
 * @param {{items?:object[], pendingPermissions?:object[]}} session
 * @returns {{plan:string|null, pending:boolean, todos:{content:string, status:string, activeForm?:string}[]|null}}
 *   pending: the plan waits for the user's approval right now (its approval card is on screen)
 */
export function planState(session) {
  const items = session.items || [];
  let plan = null;
  let todos = null;
  for (let index = items.length - 1; index >= 0 && !(plan && todos); index -= 1) {
    const item = items[index];
    if (item.kind === 'divider' && (item.cleared || item.text?.startsWith('שיחה חדשה'))) break; // /clear: what came before is another conversation
    if (item.kind !== 'tool' || item.parent) continue; // a subagent's plan or todos are not the session's
    if (!plan && item.name === 'ExitPlanMode' && typeof item.input?.plan === 'string') plan = item.input.plan;
    if (!todos && item.name === 'TodoWrite' && Array.isArray(item.input?.todos)) todos = item.input.todos;
  }
  const waiting = (session.pendingPermissions || []).find(prompt => prompt.toolName === 'ExitPlanMode');
  if (typeof waiting?.input?.plan === 'string') plan = waiting.input.plan;
  return { plan, pending: Boolean(waiting), todos };
}
