/**
 * Fake CLI (fake-claude.js): turns where Claude repeats itself, to test the loop detector (lib/loop-detector/).
 * "loop [n]": n identical Bash calls; "editloop [n]": n Edits of one file (new_string differs each time) that all fail; "subloop": identical calls made
 * inside a subagent (parent_tool_use_id set); "pollloop": BashOutput polled 5 times. Calls run without a permission
 * prompt, 150 ms apart; the turn stops sending as soon as it is interrupted.
 */
const TOOLS = {
  loop: { name: 'Bash', input: { command: 'npm test', description: 'Run tests' }, result: 'All 12 tests passed', error: false },
  editloop: { name: 'Edit', input: { file_path: 'C:\\repo\\app.js', old_string: 'const x = 1;', new_string: 'const x = 2;' }, result: 'String to replace not found in file (old_string not found)', error: true },
  subloop: { name: 'Bash', input: { command: 'ls' }, result: 'a.txt', error: false, parent: 'toolu_agent' },
  pollloop: { name: 'BashOutput', input: { bash_id: 'bash_1' }, result: 'still running', error: false },
};

/**
 * @param {string} prompt the user's text: a keyword of TOOLS (an optional number after it is the repeat count)
 * @param {(message:object)=>void} out writes one stream-json line
 * @param {string} sessionId
 * @param {()=>boolean} isInterrupted
 * @param {(ms:number)=>Promise<void>} sleep
 */
async function run(prompt, out, sessionId, isInterrupted, sleep) {
  const kind = /editloop|subloop|pollloop|\bloop\b/.exec(prompt)?.[0];
  const tool = TOOLS[kind];
  if (!tool) return;
  const count = Number(new RegExp(`${kind}\\s+(\\d+)`).exec(prompt)?.[1] || 5);
  const parent = tool.parent || null;
  if (parent) out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: parent, name: 'Task', input: { prompt: 'subagent' } }] }, parent_tool_use_id: null, session_id: sessionId });
  for (let index = 0; index < count && !isInterrupted(); index += 1) {
    const id = `toolu_${kind}_${index}`;
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: tool.name, input: kind === 'editloop' ? { ...tool.input, new_string: `const x = ${index + 2};` } : tool.input }] }, parent_tool_use_id: parent, session_id: sessionId });
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: tool.result, is_error: tool.error }] }, parent_tool_use_id: parent, session_id: sessionId });
    await sleep(150);
  }
}

module.exports = { run };
