/**
 * Per-session tool limits, the flags: `--tools` (the built-in set) when the CLI's --help lists it, else `--disallowedTools`
 * with the built-ins left out of the list. Each name is its own argv item; an empty list (or none of the built-ins) adds nothing.
 * MCP tool names are not built-ins: `--tools` does not take them, so they are dropped here (MCP servers are switched live, mcp-apply.js).
 */
const { BUILTIN_TOOLS } = require('./tool-names');

/** @param {{toolsOnly?:string[]}} session @param {(flag:string)=>boolean} supports @returns {string[]} */
function toolArgs(session, supports) {
  const keep = (session.toolsOnly || []).filter(name => !name.startsWith('mcp__'));
  if (!keep.length) return [];
  if (supports('--tools')) return ['--tools', ...keep];
  const left = BUILTIN_TOOLS.filter(name => !keep.includes(name));
  return supports('--disallowedTools') && left.length ? ['--disallowedTools', ...left] : [];
}

module.exports = { toolArgs };
