/**
 * Fake CLI (fake-claude.js): the conversation file the real CLI keeps, <config>/projects/<folder>/<id>.jsonl, which the
 * GUI shows (lib/session-cli-sync.js). Every top-level message is a line chained by `parentUuid`; a message sent into a
 * running turn is a `queued_command` attachment, like the real CLI writes it; --resume-session-at continues from that
 * answer. Only the fields the GUI reads. CLAUDE_CONFIG_DIR is honored like the real CLI.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const flag = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const folder = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'));

/** @param {string} sessionId @returns {(write:Function)=>Function} wraps the output function: what it writes is recorded too */
function recorder(sessionId) {
  const file = path.join(folder, `${sessionId}.jsonl`);
  let leaf = flag('--resume-session-at');
  if (!leaf && fs.existsSync(file)) leaf = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).findLast(line => line.uuid)?.uuid || null;
  const append = line => {
    fs.mkdirSync(folder, { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify({ parentUuid: leaf, isSidechain: false, sessionId, entrypoint: process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-cli', cwd: process.cwd(), timestamp: new Date().toISOString(), ...line })}\n`);
    leaf = line.uuid;
  };
  return write => message => {
    const { queued, ...event } = message;
    const recorded = (event.type === 'user' || event.type === 'assistant') && !event.parent_tool_use_id;
    if (recorded && !event.uuid) event.uuid = crypto.randomUUID(); // tool results
    if (recorded && queued) append({ type: 'attachment', uuid: crypto.randomUUID(), attachment: { type: 'queued_command', prompt: event.message.content } });
    else if (recorded) append({ type: event.type, uuid: event.uuid, message: { role: event.type, content: event.message.content } });
    if (event.type === 'system' && event.subtype === 'local_command_output') {
      append({ type: 'user', uuid: crypto.randomUUID(), message: { role: 'user', content: `<local-command-stdout>${event.content}</local-command-stdout>` } });
    }
    return write(event);
  };
}

module.exports = { recorder };
