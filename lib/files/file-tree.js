/** One folder level of the session folder for the Files pane (lazy: a folder is read when it is opened). */
const fs = require('fs');
const path = require('path');
const { httpError } = require('../http-utils');
const { rootsOf, resolveInside, isInside, realOrNull } = require('./safe-path');

const MAX_ENTRIES = 2000;
const NEVER = new Set(['.git']); // a .git folder, or a worktree's .git file
// Dependency and tool folders: hidden until the user asks for them (they can hold tens of thousands of files).
const NOISE = new Set(['node_modules', '__pycache__', '.venv', 'venv', '.next', '.gradle', '.idea', '.vs', 'coverage']);

/**
 * @param {object} session @param {string} dir relative to the session folder ('' = the folder itself)
 * @param {{showHidden?:boolean}} [options]
 * @returns {{dir:string, entries:{name:string, type:'dir'|'file', blocked?:boolean}[], truncated:boolean}} blocked: a link to
 *   something outside the session's folders (listed, not opened)
 */
function listDirectory(session, dir, { showHidden = false } = {}) {
  const roots = rootsOf(session);
  const real = resolveInside(roots, session.cwd, dir || '.');
  if (!fs.statSync(real).isDirectory()) throw httpError(400, 'זו לא תיקייה');
  const entries = [];
  let truncated = false;
  for (const entry of fs.readdirSync(real, { withFileTypes: true })) {
    if (NEVER.has(entry.name) || (!showHidden && NOISE.has(entry.name))) continue;
    if (entries.length >= MAX_ENTRIES) { truncated = true; break; }
    const target = realOrNull(path.join(real, entry.name));
    const blocked = !target || !roots.some(root => isInside(target, root));
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink() && target) { try { isDir = fs.statSync(target).isDirectory(); } catch { isDir = false; } }
    entries.push({ name: entry.name, type: isDir ? 'dir' : 'file', ...(blocked && { blocked: true }) });
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return { dir: dir || '', entries, truncated };
}

module.exports = { listDirectory };
