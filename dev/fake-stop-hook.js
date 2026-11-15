/**
 * Stop hooks for the fake CLI (fake-claude.js), as Claude Code's docs describe them: with `--settings <file>` holding
 * hooks.Stop, each hook command runs at the end of a turn (through the shell) with JSON on stdin; exit code 2 blocks
 * the stop and its stderr goes back to the model, which answers again in the SAME turn (stop_hook_active: true next
 * time). A prompt with "edit" makes each continuation edit a file again, so the verify loop can be tested.
 */
const fs = require('fs');
const { spawn } = require('child_process');

const MAX_ROUNDS = 10; // the fake's own safety net; the GUI server is the real cap

function stopHooks(args) {
  const index = args.indexOf('--settings');
  if (index < 0) return [];
  try {
    const settings = JSON.parse(fs.readFileSync(args[index + 1], 'utf8'));
    return (settings.hooks?.Stop || []).flatMap(group => group.hooks || []).filter(hook => hook.type === 'command' && hook.command);
  } catch { return []; }
}

/** @returns {Promise<{code:number|null, stderr:string}>} */
function runHook(hook, input) {
  return new Promise(resolve => {
    const child = spawn(hook.command, { shell: true, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => child.kill(), (hook.timeout || 60) * 1000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', text => { stderr += text; });
    child.on('error', () => { clearTimeout(timer); resolve({ code: null, stderr }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stderr }); });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
  });
}

/**
 * Runs the Stop hooks until they let the turn stop, with another answer round after each block.
 * @param {{args:string[], sessionId:string, out:Function, stream:Function, prompt:string, stopped:()=>boolean}} turn
 */
async function stopHookRounds({ args, sessionId, out, stream, prompt, stopped }) {
  const hooks = stopHooks(args);
  for (let round = 0; hooks.length && round < MAX_ROUNDS && !stopped(); round += 1) {
    const input = { session_id: sessionId, transcript_path: '', cwd: process.cwd(), hook_event_name: 'Stop', stop_hook_active: round > 0 };
    const results = await Promise.all(hooks.map(hook => runHook(hook, input)));
    const blocked = results.filter(result => result.code === 2);
    if (!blocked.length || stopped()) return;
    const reason = blocked.map(result => result.stderr.trim()).join('\n');
    if (/edit/.test(prompt)) {
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `toolu_fix_${Date.now()}_${round}`, name: 'Edit', input: { file_path: 'C:\\repo\\app.js', old_string: 'const b = 3;', new_string: `const b = ${round + 4};` } }] }, parent_tool_use_id: null, session_id: sessionId });
    }
    await stream(`ממשיך בגלל Stop hook: ${reason}`, 5);
  }
}

module.exports = { stopHookRounds };
