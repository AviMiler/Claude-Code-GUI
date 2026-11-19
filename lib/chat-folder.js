/**
 * "Chat without a project": a normal session (all tools) whose folder is ONE permanent shared folder owned by the GUI,
 * `<DATA_DIR>/chats`. The folder carries its own Claude settings (`.claude/`) and a seed `CLAUDE.md` that the user edits in Settings
 * edit. Files that already exist are never overwritten. The request never names this folder: it is always this path.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DATA_DIR } = require('./session-store');
const { httpError } = require('./http-utils');

const CHAT_NAME = "צ'אט חדש";
const SEED = `# צ'אט כללי / General chat

זהו צ'אט כללי, ללא פרויקט. אין כאן קוד או קבצים של פרויקט; שיחות כאן עוסקות בשאלות, כתיבה ועזרה כללית.
This is a general chat with no project. You may edit this file; it applies to every chat without a project.
`;

/** The path of the shared chats folder (not created). */
const chatsDir = () => path.join(DATA_DIR, 'chats');

/** Creates the folder, its `.claude/` and the seed `CLAUDE.md` when missing; never overwrites. @returns {string} the folder */
function ensureChatFolder() {
  const dir = chatsDir();
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  try { fs.writeFileSync(path.join(dir, 'CLAUDE.md'), SEED, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  // Its own git repository, so git (Changes pane, status) never reaches the GUI's repo above a data folder inside it. Best effort.
  if (!fs.existsSync(path.join(dir, '.git'))) { try { execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore', timeout: 10000 }); } catch { /* no git: nothing to isolate */ } }
  return dir;
}

const samePath = (a, b) => (process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));
/** Whether a folder is the chats folder. */
const isChatFolder = folder => typeof folder === 'string' && samePath(folder, chatsDir());

/** A chat has no worktree: it has no project. Throws 400 for `worktree: true`. */
function refuseWorktree(worktree) {
  if (worktree === true) throw httpError(400, 'צ\'אט ללא פרויקט אינו נפתח ב-worktree.');
}

module.exports = { CHAT_NAME, chatsDir, ensureChatFolder, isChatFolder, refuseWorktree };
