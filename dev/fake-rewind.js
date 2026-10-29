/**
 * Fake CLI (fake-claude.js): what rewind needs. Messages get uuids (assistant events carry one, user messages are replayed
 * with the uuid the GUI sent), the conversation and the file checkpoints persist per session id so --resume and
 * --resume-session-at work across processes, and `rewind_files` restores the files a prompt "write <name>" created or changed
 * (only inside the working folder). FAKE_STATE_DIR: where the state lives. FAKE_NO_REWIND_FILES: the CLI lacks rewind_files.
 * FAKE_NO_RESUME_AT: the CLI refuses --resume-session-at (exits at once).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const flag = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const sessionId = flag('--resume') || `fake-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const stateFile = path.join(process.env.FAKE_STATE_DIR || os.tmpdir(), `fake-rewind-${sessionId}.json`);
let state = { messages: [], changes: {} }; // messages: { role, uuid, text }; changes: user uuid -> [{ file, before }]
try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* a new conversation */ }
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));

const resumeAt = flag('--resume-session-at');
if (resumeAt) {
  const at = state.messages.findIndex(message => message.role === 'assistant' && message.uuid === resumeAt);
  if (process.env.FAKE_NO_RESUME_AT || at < 0) { process.stderr.write(`error: unknown option or message '--resume-session-at ${resumeAt}'\n`); process.exit(1); }
  state.messages = state.messages.slice(0, at + 1);
  const users = new Set(state.messages.filter(message => message.role === 'user').map(message => message.uuid));
  state.changes = Object.fromEntries(Object.entries(state.changes).filter(([uuid]) => users.has(uuid)));
  save();
}

/** Wraps the output function: assistant events get a uuid and are remembered as points the conversation can be cut at. */
function uuidOut(write) {
  return message => {
    if (message.type !== 'assistant' || message.uuid) return write(message);
    const uuid = crypto.randomUUID();
    state.messages.push({ role: 'assistant', uuid });
    save();
    return write({ ...message, uuid });
  };
}

const inside = file => { const full = path.resolve(process.cwd(), file); return full.startsWith(`${process.cwd()}${path.sep}`) ? full : null; };

/** A user message begins a turn: it is replayed with its uuid, and a prompt "write <name>" changes a file (with a checkpoint). */
function begin(out, uuid, text) {
  if (!uuid) return;
  state.messages.push({ role: 'user', uuid, text });
  out({ type: 'user', isReplay: true, uuid, message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: sessionId });
  const wanted = /\bwrite (\S+)/.exec(text);
  const full = wanted && inside(wanted[1]);
  if (full) {
    state.changes[uuid] = [...(state.changes[uuid] || []), { file: full, before: fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null }];
    fs.writeFileSync(full, `${fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : ''}line by ${uuid.slice(0, 4)}\n`);
  }
  save();
}

/** rewind_files: the changes of this message and every later one, undone newest first (or only counted: dry_run). */
function rewindFiles({ user_message_id: uuid, dry_run: dryRun }) {
  const at = state.messages.findIndex(message => message.role === 'user' && message.uuid === uuid);
  if (at < 0) return { canRewind: false, error: 'No file checkpoint for this message' };
  const later = state.messages.slice(at).filter(message => message.role === 'user').map(message => message.uuid).reverse();
  const undo = later.flatMap(id => [...(state.changes[id] || [])].reverse());
  const files = [...new Set(undo.map(change => change.file))];
  const lines = text => (text ? text.split('\n').length - 1 : 0);
  const insertions = undo.reduce((sum, change) => sum + lines(change.before), 0);
  const deletions = undo.reduce((sum, change) => sum + lines(fs.existsSync(change.file) ? fs.readFileSync(change.file, 'utf8') : '') - lines(change.before), 0);
  if (!dryRun) {
    for (const change of undo) { if (change.before === null) fs.rmSync(change.file, { force: true }); else fs.writeFileSync(change.file, change.before); }
    later.forEach(id => { delete state.changes[id]; });
    save();
  }
  return { canRewind: true, filesChanged: files.map(file => path.relative(process.cwd(), file)), insertions, deletions };
}

module.exports = { sessionId, uuidOut, begin, control: process.env.FAKE_NO_REWIND_FILES ? {} : { rewind_files: rewindFiles } };
