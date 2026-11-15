/**
 * Per-session tool limits, what the choices are: the tool names the CLI reported for the session (init event, sent as
 * `toolNames`), else Claude Code's known built-in tools (a FIXED fallback, the same list as lib/tool-limits/tool-names.js).
 */
export const FALLBACK_TOOLS = ['Bash', 'Edit', 'Glob', 'Grep', 'NotebookEdit', 'Read', 'Task', 'TodoWrite', 'WebFetch', 'WebSearch', 'Write'];
/** "פרופיל רזה": the few tools a small model needs for most coding work. */
export const LEAN_PROFILE = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'];

/**
 * @param {{toolsOnly?:string[]}} session @param {{toolNames?:string[]}|null} info the runtime's init info
 * @returns {{names:string[], reported:boolean}} built-in tool names to show as checkboxes (a limited session reports fewer than it has, so the
 *   known list and the session's own choice are always included); `reported` when the CLI named some
 */
export function availableTools(session, info) {
  const reported = (info?.toolNames || []).filter(name => !name.startsWith('mcp__'));
  const names = [...new Set([...FALLBACK_TOOLS, ...reported, ...(session.toolsOnly || []).filter(name => !name.startsWith('mcp__'))])].sort();
  return { names, reported: reported.length > 0 };
}

/** @returns {string[]} the MCP servers to show as switches: the ones the CLI reported plus the ones the session switched off */
export const mcpServerNames = (session, info) => [...new Set([...(info?.mcpServers || []).map(server => server.name), ...(session.mcpOff || [])])];
