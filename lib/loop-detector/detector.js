/**
 * Loop detection core (pure state machine, no I/O): feed it the top-level tool calls and tool results of ONE turn
 * and it answers when Claude is repeating itself: the same call (tool + canonical input) `limit` times in a row,
 * or the same file failing Edit / MultiEdit `limit` times in a row. Polling tools never count.
 */
const EXEMPT = new Set(['BashOutput', 'TaskOutput', 'Monitor', 'KillShell']);
const EDITS = new Set(['Edit', 'MultiEdit']);

/** JSON with object keys sorted at every level, so key order never hides a repeat. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** The one-line form of a call for the notice, e.g. `Bash: npm test`. */
function describeCall(name, input) {
  const detail = input?.command || input?.file_path || input?.path || input?.pattern || input?.url || input?.description || '';
  return detail ? `${name}: ${String(detail).replace(/\s+/g, ' ').slice(0, 80)}` : name;
}

/**
 * @param {number} limit repeats that make a loop; 0 (or invalid) turns detection off
 * @returns {{observe:(item:object)=>(null|{reason:'repeat'|'edit-fail', count:number, call:string})}}
 */
function createLoopDetector(limit) {
  const calls = new Map(); // tool id -> { name, input } of top-level calls still waiting for their result
  let streak = { key: null, count: 0 };
  let editFails = { file: null, count: 0 };
  let fired = false;

  function onCall(item) {
    calls.set(item.id, { name: item.name, input: item.input });
    if (EXEMPT.has(item.name)) return null; // polling: neither counts nor breaks a streak
    const key = `${item.name} ${canonical(item.input)}`;
    streak = key === streak.key ? { key, count: streak.count + 1 } : { key, count: 1 };
    return streak.count >= limit ? { reason: 'repeat', count: streak.count, call: describeCall(item.name, item.input) } : null;
  }

  function onResult(item) {
    const call = calls.get(item.toolUseId);
    calls.delete(item.toolUseId);
    if (!call || !EDITS.has(call.name)) return null;
    const file = call.input?.file_path;
    if (!item.isError || !file) { editFails = { file: null, count: 0 }; return null; }
    editFails = file === editFails.file ? { file, count: editFails.count + 1 } : { file, count: 1 };
    return editFails.count >= limit ? { reason: 'edit-fail', count: editFails.count, call: describeCall(call.name, call.input) } : null;
  }

  return {
    observe(item) {
      if (fired || !(limit > 0) || item.parent) return null;
      const verdict = item.kind === 'tool' ? onCall(item) : item.kind === 'tool-result' ? onResult(item) : null;
      if (verdict) fired = true;
      return verdict;
    },
  };
}

module.exports = { createLoopDetector, canonical };
