/**
 * Fake `claude` CLI for developing the GUI without an API key. Speaks the stream-json + control protocol.
 * Prompt keywords (whole words where they overlap): "bash" -> tool + permission prompt, "ask" -> AskUserQuestion, "plan" -> ExitPlanMode,
 * "slow" -> long streaming (to test stop), "fail" -> crash, "task" -> a background task that ends 8 s later, "elicit" / "elicit-url" -> an MCP elicitation, "write <file>" -> changes a file (rewind, fake-rewind.js)
 * MAX_THINKING_TOKENS=0 -> no thinking item; FAKE_NO_SYSTEM_PROMPT_FILE / FAKE_NO_REPLACE_PROMPT hide the system prompt flags from --help
 * (FAKE_TASK_MS changes it; stop_task / get_task_output answer for it). Anything else -> streamed echo.
 * FAKE_CLAUDE_STARTUP_MS delays the first answer, like the real CLI's startup (seconds on Windows).
 * A message with a uuid sent while a turn runs is a correction (fake-corrections.js).
 */
const readline = require('readline');
const args = process.argv.slice(2);
const rewind = require('./fake-rewind');
const out = rewind.uuidOut(message => process.stdout.write(`${JSON.stringify(message)}\n`));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const { createCorrections } = require('./fake-corrections'); const { fakeCatalog } = require('./fake-catalog'); const { elicit } = require('./fake-elicitation');

if (args.includes('--version')) { console.log('2.1.308 (Claude Code)'); process.exit(0); }
if (args.includes('--help')) {
  console.log(`Usage: claude [options]\n  --model <model>${process.env.FAKE_NO_FALLBACK ? '' : '\n  --fallback-model <model>'}${process.env.FAKE_NO_SYSTEM_PROMPT_FILE ? '' : `\n  --append-system-prompt-file <file>${process.env.FAKE_NO_REPLACE_PROMPT ? '' : '\n  --system-prompt-file <file>'}`}\n  --effort <level>\n  --agent <agent>\n  --add-dir <directories...>
  --include-partial-messages\n  --replay-user-messages\n  --permission-prompts <target>\n  --fork-session\n  --settings <file-or-json>
  --permission-mode <mode>  Permission mode (choices: "acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan")
Commands:\n  mcp  Configure MCP\n  plugin|plugins  Manage plugins\n  doctor  Check health`);
  process.exit(0);
}
if (args[0] === 'mcp') { console.log('dummy: node server.js - ✓ Connected'); process.exit(0); }
if (args[0] === 'plugin') { console.log(args.includes('--json') ? '[]' : 'No plugins installed'); process.exit(0); }
if (args[0] === 'doctor' || args[0] === 'auth') { console.log('Claude Code doctor (fake)\nAll good'); process.exit(0); }

const { sessionId } = rewind;
let mode = args.includes('--permission-mode') ? args[args.indexOf('--permission-mode') + 1] : 'default';
let interrupted = false;
let running = false;
const corrections = createCorrections(out, sessionId);
const waiting = new Map();
let counter = 0;

const CATALOG = fakeCatalog(mode);
const tasks = new Map(); // task id -> timer of a running background task
function endTask(id, status, summary) {
  if (!tasks.has(id)) return false;
  clearTimeout(tasks.get(id));
  tasks.delete(id);
  out({ type: 'system', subtype: 'task_notification', task_id: id, tool_use_id: `toolu_${id}`, status, summary, output_file: `/tmp/${id}.output`, usage: { total_tokens: 0, tool_uses: 1, duration_ms: 1000 }, session_id: sessionId });
  return true;
}
function startTask() {
  const id = `task_${++counter}`;
  out({ type: 'system', subtype: 'task_started', task_id: id, tool_use_id: `toolu_${id}`, description: 'npm run build', task_type: 'local_bash', is_backgrounded: true, session_id: sessionId });
  setTimeout(() => tasks.has(id) && out({ type: 'system', subtype: 'task_progress', task_id: id, tool_use_id: `toolu_${id}`, description: 'npm run build', usage: { total_tokens: 1200, tool_uses: 2, duration_ms: 1500 }, last_tool_name: 'Bash', session_id: sessionId }), 1500);
  tasks.set(id, setTimeout(() => endTask(id, 'completed', 'Build finished'), Number(process.env.FAKE_TASK_MS || 8000)));
}

const CONTROL = {
  initialize: () => CATALOG,
  get_skills_dialog: () => ({ skills: [{ name: 'hello-skill', description: 'Says hello', source: 'project', tokens: 13, state: 'on' }] }),
  mcp_status: () => ({ mcpServers: [{ name: 'dummy', status: 'connected', scope: 'project', config: { type: 'stdio', command: 'node' }, tools: [{ name: 'ping' }] }] }),
  get_context_usage: () => ({ categories: [{ name: 'System prompt', tokens: 2600, kind: 'used' }, { name: 'Messages', tokens: 9000, kind: 'used' }, { name: 'Free space', tokens: 188400, kind: 'free' }], totalTokens: 11600, maxTokens: 200000, percentage: 6 }),
  get_status: () => ({ sections: [{ title: 'Session', rows: [{ label: 'Version', value: '2.1.308 (fake)' }, { label: 'Session ID', value: sessionId }] }] }),
  get_session_cost: () => ({ text: 'Total cost: $0.0000' }),
  list_permission_rules: () => ({ state: { rules: [{ behavior: 'allow', source: 'localSettings', rule: 'Bash(git status)' }] } }),
  get_hooks_listing: () => ({ hooks: [], eventCatalog: [{ name: 'PreToolUse', summary: 'Before tool execution' }] }),
  get_memory_dialog: () => ({ files: [], folders: [], memories: [] }),
  get_settings: () => ({ effective: {}, sources: [] }),
  side_question: async request => { await sleep(600); return { response: `**תשובת צד מזויפת** ל: ${request.question} (היסטוריה: ${(request.history || []).length})`, synthetic: false }; },
  stop_task: request => { if (!endTask(request.task_id, 'stopped', 'Stopped by the user')) throw new Error(`No running task ${request.task_id}`); return {}; },
  get_task_output: request => ({ output: `> build\ncompiling ${request.task_id}...\ndone` }),
  ...rewind.control, set_model: () => ({}), interrupt: () => { interrupted = true; corrections.sweep(); return {}; },
  cancel_async_message: request => ({ cancelled: corrections.cancel(request.message_uuid) }),
  set_permission_mode: request => { mode = request.mode; return { mode }; },
};

function ask(request) {
  const id = `perm-${++counter}`;
  out({ type: 'control_request', request_id: id, request: { subtype: 'can_use_tool', ...request } });
  return new Promise(resolve => waiting.set(id, resolve));
}

async function stream(text, delayMs) {
  for (const word of text.split(' ')) {
    if (interrupted) return;
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: `${word} ` } }, session_id: sessionId });
    await sleep(delayMs);
  }
  out({ type: 'assistant', message: { content: [{ type: 'text', text }] }, parent_tool_use_id: null, session_id: sessionId });
}

async function toolTurn(name, input, resultText) {
  const id = `toolu_${++counter}`;
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] }, parent_tool_use_id: null, session_id: sessionId });
  const answer = await ask({ tool_name: name, input, tool_use_id: id, permission_suggestions: [{ type: 'addRules', rules: [{ toolName: name, ruleContent: 'npm test:*' }], behavior: 'allow', destination: 'localSettings' }] });
  const denied = answer.behavior !== 'allow';
  const text = denied ? answer.message : resultText(answer.updatedInput || input);
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: denied }] }, parent_tool_use_id: null, session_id: sessionId });
}

async function turn(prompt) {
  interrupted = false;
  running = true;
  const started = Date.now();
  out({ type: 'system', subtype: 'init', session_id: sessionId, model: 'fake-model', permissionMode: mode, tools: ['Bash', 'Read'], mcp_servers: [{ name: 'dummy', status: 'connected' }], claude_code_version: '2.1.308' });
  if (prompt.startsWith('/cost')) {
    out({ type: 'system', subtype: 'local_command_output', content: 'Total cost: $0.0123\nTotal duration: 3s', session_id: sessionId });
  } else if (/fail/.test(prompt)) {
    process.stderr.write('Fake failure: API Error 500\n');
    process.exit(1);
  } else {
    if (process.env.MAX_THINKING_TOKENS !== '0') out({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: `The user said: ${prompt}. I will answer.` }] }, parent_tool_use_id: null, session_id: sessionId });
    if (/bash/.test(prompt)) await toolTurn('Bash', { command: 'npm test', description: 'Run tests' }, () => 'All 12 tests passed');
    if (/\bask/.test(prompt)) await toolTurn('AskUserQuestion', { questions: [{ question: 'איזה צבע?', header: 'צבע', multiSelect: false, options: [{ label: 'כתום', description: 'צבע Claude' }, { label: 'כחול', description: 'קלאסי' }] }] }, input => `answers: ${JSON.stringify(input.answers)}`);
    if (/plan/.test(prompt)) await toolTurn('ExitPlanMode', { plan: '## התוכנית\n1. לקרוא קבצים\n2. לערוך את `app.js`\n3. להריץ בדיקות' }, () => 'Plan approved');
    if (/elicit/.test(prompt)) out({ type: 'assistant', message: { content: [{ type: 'text', text: `תשובת ה-GUI לבקשת MCP: ${JSON.stringify(await elicit(out, waiting, `elic-${++counter}`, /elicit-url/.test(prompt) ? 'url' : 'form'))}` }] }, parent_tool_use_id: null, session_id: sessionId });
    if (/task/.test(prompt)) startTask();
    if (/edit/.test(prompt)) out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_edit', name: 'Edit', input: { file_path: 'C:\\repo\\app.js', old_string: 'const a = 1;\nconst b = 2;', new_string: 'const a = 1;\nconst b = 3;\nconst c = 4;' } }] }, parent_tool_use_id: null, session_id: sessionId });
    if (/todo/.test(prompt)) out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_todo', name: 'TodoWrite', input: { todos: [{ content: 'Read code', status: 'completed', activeForm: 'Reading' }, { content: 'Write fix', status: 'in_progress', activeForm: 'Writing fix' }, { content: 'Run tests', status: 'pending', activeForm: 'Running tests' }] } }] }, parent_tool_use_id: null, session_id: sessionId });
    const heard = corrections.drain(); // the step before the answer: corrections that came during the tools join here
    const seen = heard.length ? ` (תיקון שהתקבל באמצע: ${heard.join(' | ')})` : '';
    await stream(`**תשובה מזויפת** ל: ${prompt}${seen}. זה טקסט שמוזרם מילה אחרי מילה כדי לבדוק את הממשק \`code\` וגם רשימה.`, /slow/.test(prompt) ? 400 : 25);
  }
  out({ type: 'result', subtype: interrupted ? 'error_during_execution' : 'success', is_error: interrupted, duration_ms: Date.now() - started, num_turns: 1, total_cost_usd: 0.0012, usage: { input_tokens: 120, output_tokens: 48 }, session_id: sessionId });
  running = false;
  // Too late for this turn (it was already answering): the waiting corrections start the next one, like the real CLI.
  if (corrections.size()) { const late = corrections.drain(); queue = queue.then(() => turn(`תיקון: ${late.join(' | ')}`)); }
}

const ready = sleep(Number(process.env.FAKE_CLAUDE_STARTUP_MS || 0));
let queue = ready;
readline.createInterface({ input: process.stdin }).on('line', line => { ready.then(() => handle(line)); })
  .on('close', () => ready.then(() => queue).then(() => process.exit(0))); // after the lines read before close

function handle(line) {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  if (message.type === 'control_response') return waiting.get(message.response.request_id)?.(message.response.response);
  if (message.type === 'control_request') {
    const handler = CONTROL[message.request.subtype];
    if (!handler) return out({ type: 'control_response', response: { subtype: 'error', request_id: message.request_id, error: `Unsupported control request subtype: ${message.request.subtype}` } });
    // Answered in the background, so a slow request (side_question) never holds up the turn.
    return Promise.resolve().then(() => handler(message.request))
      .then(response => out({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response } }))
      .catch(error => out({ type: 'control_response', response: { subtype: 'error', request_id: message.request_id, error: error.message } }));
  }
  if (message.type === 'user') {
    const content = message.message.content;
    const images = Array.isArray(content) ? content.filter(block => block.type === 'image') : [];
    const text = typeof content === 'string' ? content : content.map(block => block.text || '').join('');
    const seen = images.map(image => `${image.source.media_type} ${Math.round(image.source.data.length * 0.75 / 1024)}KB`);
    if (running && message.uuid) return corrections.add(message.uuid, text);
    queue = queue.then(() => { rewind.begin(out, message.uuid, text); return turn(images.length ? `${text} [${images.length} images: ${seen.join(', ')}]` : text); });
  }
}
