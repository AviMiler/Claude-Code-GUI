/**
 * Per-session tool limits, MCP servers: the servers the session switched off are turned off with the live `mcp_toggle`
 * control request once `initialize` is answered. A CLI without the request answers an error, which is ignored (the
 * servers then stay on; the next turn's init event, shown in the panel, tells what is really on).
 */

/** @param {{initialize:Promise, proc:{request:Function}}} runtime @param {{mcpOff?:string[]}} session */
function disableMcp(runtime, session) {
  const names = session.mcpOff || [];
  if (!names.length) return;
  runtime.initialize.then(init => init && Promise.all(names.map(serverName =>
    runtime.proc.request('mcp_toggle', { serverName, enabled: false }, 20000).catch(() => {}))));
}

module.exports = { disableMcp };
