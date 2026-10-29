const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// CLAUDE_GUI_DATA keeps development runs (fake CLI) away from the real sessions.
const DATA_DIR = process.env.CLAUDE_GUI_DATA || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');
const SAVE_DELAY_MS = 300;

const sessions = new Map();
let saveTimer = null;

function writeNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify([...sessions.values()]));
  } catch (error) {
    console.error('[session-store] cannot save sessions:', error.message);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, SAVE_DELAY_MS);
}

function load() {
  try {
    for (const saved of JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))) {
      // No process survives a restart. Older saved sessions lack the newer fields.
      sessions.set(saved.id, { addDirs: [], costUsd: 0, queue: [], updatedAt: saved.createdAt, ...saved, status: 'idle' });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[session-store] cannot load sessions:', error.message);
  }
}

const list = () => [...sessions.values()];
const get = id => sessions.get(id);

/**
 * Creates a session. `claudeSessionId` stays null until the CLI reports its own id,
 * unless the session continues (resume/fork) an existing CLI conversation.
 * `worktree` ({path, branch, root, source}) when the session runs in its own git worktree (lib/git/worktree.js).
 */
function create({ name, cwd, mode, model = '', effort = '', claudeSessionId = null, forkPending = false, items = [], worktree = null }) {
  const session = {
    id: crypto.randomUUID(), name, cwd, mode, model, effort, agent: '', outputStyle: '', addDirs: [], worktree,
    claudeSessionId, forkPending, status: 'idle', items, queue: [], costUsd: 0, createdAt: Date.now(), updatedAt: Date.now(),
  };
  sessions.set(session.id, session);
  scheduleSave();
  return session;
}

function update(id, patch) {
  const session = Object.assign(sessions.get(id), patch);
  scheduleSave();
  return session;
}

function addItem(id, item) {
  const session = sessions.get(id);
  session.items.push(item);
  session.updatedAt = Date.now();
  scheduleSave();
}

function remove(id) {
  sessions.delete(id);
  scheduleSave();
}

load();
process.on('exit', writeNow);

module.exports = { list, get, create, update, addItem, remove, DATA_DIR };
