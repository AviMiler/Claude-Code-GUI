/**
 * Fake CLI (fake-claude.js): tool limits. `--help` lists --tools and --disallowedTools (FAKE_NO_TOOLS / FAKE_NO_DISALLOWED hide them);
 * the init event echoes the tools the process was started with (so tests can assert the argv) and the MCP server's state;
 * `mcp_toggle` switches the dummy server (FAKE_NO_MCP_TOGGLE: unsupported, like an older CLI).
 */
const ALL = ['Bash', 'Edit', 'Glob', 'Grep', 'NotebookEdit', 'Read', 'Task', 'TodoWrite', 'WebFetch', 'WebSearch', 'Write'];
const off = new Set(); // MCP servers switched off with mcp_toggle

/** The values after a flag, up to the next flag. */
const valuesOf = (args, flag) => (args.includes(flag) ? args.slice(args.indexOf(flag) + 1).filter((_, i, rest) => !rest.slice(0, i + 1).some(item => item.startsWith('-'))) : null);

const help = () => `${process.env.FAKE_NO_TOOLS ? '' : '\n  --tools <tools...>'}${process.env.FAKE_NO_DISALLOWED ? '' : '\n  --disallowedTools <tools...>'}`;

/** What the init event lists as tools. */
function initTools(args) {
  const only = valuesOf(args, '--tools');
  const without = valuesOf(args, '--disallowedTools');
  return only || (without ? ALL.filter(name => !without.includes(name)) : ['Bash', 'Read']);
}

const mcpServers = () => [{ name: 'dummy', status: off.has('dummy') ? 'disabled' : 'connected' }];

const control = {
  mcp_status: () => ({ mcpServers: [{ name: 'dummy', status: mcpServers()[0].status, scope: 'project', config: { type: 'stdio', command: 'node' }, tools: [{ name: 'ping' }] }] }),
  ...(process.env.FAKE_NO_MCP_TOGGLE ? {} : { mcp_toggle: request => { off[request.enabled ? 'delete' : 'add'](request.serverName); return {}; } }),
};

module.exports = { help, initTools, mcpServers, control };
