/**
 * Per-session tool limits, the names: which tool names and MCP server names a PATCH may carry. Not a security feature:
 * the list only shortens the prompt (fewer tool definitions for a small model), the CLI's permission prompts still decide.
 * Names reach the CLI as argv items through the Windows `.cmd` shim (a `%` throws, quotes are mangled), so only plain
 * identifiers pass: no rules like `Bash(git:*)`.
 */
const { httpError } = require('../http-utils');

const MAX_NAMES = 100;
const TOOL_NAME = /^(?:[A-Za-z][A-Za-z0-9_]*|mcp__[A-Za-z0-9_-]+(?:__[A-Za-z0-9_-]+)?)$/;
// An MCP server name goes in a JSON control request, never in argv, and the CLI's own names hold spaces and dots ("claude.ai Gmail").
const SERVER_NAME = /^[^\s\u0000-\u001f\u007f][^\u0000-\u001f\u007f]{0,99}$/;
/** Claude Code's built-in tools: the complement for --disallowedTools (public/js/tool-limits/tool-catalog.js has the same list for the checkboxes). */
const BUILTIN_TOOLS = ['Bash', 'Edit', 'Glob', 'Grep', 'NotebookEdit', 'Read', 'Task', 'TodoWrite', 'WebFetch', 'WebSearch', 'Write'];

/** @returns {string[]} the names, deduplicated @throws {Error} 400 for a non-array, a bad or non-string name, or more than 100 */
function checkNames(value, pattern, label) {
  if (!Array.isArray(value) || value.length > MAX_NAMES) throw httpError(400, `${label}: רשימה של עד ${MAX_NAMES} שמות`);
  if (!value.every(name => typeof name === 'string' && pattern.test(name))) throw httpError(400, `${label}: שם לא תקין`);
  return [...new Set(value)];
}

/** @returns {object} the changes for `toolsOnly` (the tools to keep, [] = all) and `mcpOff` (MCP servers switched off) that the patch carries */
function toolChanges(patch) {
  const changes = {};
  if (patch.toolsOnly !== undefined) changes.toolsOnly = checkNames(patch.toolsOnly, TOOL_NAME, 'כלים');
  if (patch.mcpOff !== undefined) changes.mcpOff = checkNames(patch.mcpOff, SERVER_NAME, 'שרתי MCP');
  return changes;
}

module.exports = { toolChanges, BUILTIN_TOOLS };
