/** The rail's Environment card: rows for the session's tool limits, only when set. @param {(label:string, value:string, title?:string)=>Node} row */
export function toolLimitRows(session, row) {
  const tools = session.toolsOnly || [];
  const off = session.mcpOff || [];
  return [
    tools.length ? row('כלים', `${tools.length} בלבד`, tools.join(', ')) : null,
    off.length ? row('MCP כבויים', String(off.length), off.join(', ')) : null,
  ];
}
