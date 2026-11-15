/** The tool a running turn is in (top level only), from its items: the last tool call without a result yet. */
export function openTool(items) {
  let tool = null;
  for (const item of items) {
    if (item.parent) continue;
    if (item.kind === 'tool') tool = item;
    else if (item.kind === 'tool-result' || item.kind === 'text') tool = null;
  }
  return tool;
}
