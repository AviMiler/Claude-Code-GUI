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
    // The conversation itself is the CLI's (lib/session-cli-sync.js builds `items` from its files): not saved here.
    fs.writeFileSync(DATA_FILE, JSON.stringify([...sessions.values()].map(({ items, historyStamp, ...saved }) => saved)));
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
      sessions.set(saved.id, { addDirs: [], queue: [], conversations: [], extras: [], sent: {}, anchors: [], updatedAt: saved.createdAt, ...saved, items: [], status: 'idle' });
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
 * `named`: a person chose the name (rename, fork), so it goes into the CLI conversation; otherwise the session takes
 * the CLI's own title (lib/session-cli-sync.js).
 * What it shows (`items`, not saved) is built from the CLI's files: `conversations` (the ones before each /clear),
 * `extras` (the GUI's own items, placed by `anchors`) and `sent` (how the GUI showed the messages it sent), see
 * lib/history-build.js.
 */
function create({ name, named = false, cwd, mode, model = '', effort = '', fallbackModel = '', claudeSessionId = null, forkPending = false, worktree = null, history = {}, options = {} }) {
  const session = {
    id: crypto.randomUUID(), name, named, cwd, mode, model, effort, fallbackModel, agent: '', outputStyle: '', addDirs: [], worktree,
    claudeSessionId, forkPending, status: 'idle', items: [], queue: [], createdAt: Date.now(), updatedAt: Date.now(),
    conversations: [], extras: [], sent: {}, anchors: [], ...history, ...options,
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
