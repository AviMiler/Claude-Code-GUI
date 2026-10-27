/**
 * Views of the file system: the folder browser of the welcome page, the file list for @-mentions,
 * and git changes for the diff panel.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { httpError } = require('./http-utils');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.next', '__pycache__', '.venv', 'venv',
  'bin', 'obj', '.idea', '.vs', 'coverage', 'target', '.gradle', 'data']);
const MAX_ENTRIES = 6000;
const MAX_DEPTH = 8;
const CACHE_MS = 30000;
const MAX_DIFF_CHARS = 300000;
const MAX_FOLDERS = 2000;
const FOLDER_NAME = /^[^\\/:*?"<>|\x00-\x1f]+$/;
const cache = new Map(); // cwd -> { at, entries }

/** Breadth-first walk, so shallow files are found first when the limit is hit. */
function walk(root) {
  const entries = [];
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length && entries.length < MAX_ENTRIES) {
    const { dir, depth } = queue.shift();
    let children = [];
    try { children = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const child of children) {
      const relative = path.relative(root, path.join(dir, child.name)).split(path.sep).join('/');
      if (child.isDirectory()) {
        if (SKIP_DIRS.has(child.name) || (child.name.startsWith('.') && child.name !== '.claude')) continue;
        entries.push(`${relative}/`);
        if (depth < MAX_DEPTH) queue.push({ dir: path.join(dir, child.name), depth: depth + 1 });
      } else {
        entries.push(relative);
      }
    }
  }
  return entries;
}

/**
 * @param {{cwd:string, q?:string}} query
 * @returns {string[]} up to 40 relative paths (folders end with '/'), best matches first.
 * @example searchFiles({ cwd: 'C:\\repo', q: 'app' }) // ['public/app.js', ...]
 */
function searchFiles({ cwd, q = '' }) {
  if (!cwd || !fs.existsSync(cwd)) throw httpError(400, `התיקייה לא קיימת: ${cwd}`);
  let cached = cache.get(cwd);
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    cached = { at: Date.now(), entries: walk(cwd) };
    cache.set(cwd, cached);
  }
  const needle = q.toLowerCase();
  const scored = cached.entries
    .map(entry => {
      const lower = entry.toLowerCase();
      const base = lower.replace(/\/$/, '').split('/').pop();
      const score = !needle ? 0 : base.startsWith(needle) ? 0 : base.includes(needle) ? 1 : lower.includes(needle) ? 2 : -1;
      return { entry, score };
    })
    .filter(({ score }) => score >= 0);
  scored.sort((a, b) => a.score - b.score || a.entry.length - b.entry.length);
  return scored.slice(0, 40).map(({ entry }) => entry);
}

/**
 * A repository's own config can make git run programs (fsmonitor, external diff, textconv filters),
 * and the folder may be one nobody reviewed, so those are switched off for these read-only views.
 */
const SAFE_GIT = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'diff.external=', '--no-pager'];
const SAFE_DIFF = ['--no-ext-diff', '--no-textconv'];

function git(cwd, args) {
  return new Promise(resolve => {
    execFile('git', [...SAFE_GIT, ...args], {
      cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true, encoding: 'utf8',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    },
      (error, stdout, stderr) => resolve({ ok: !error, stdout: stdout || '', stderr: stderr || (error?.message ?? '') }));
  });
}

/** git status + diff of uncommitted changes (like /diff). */
async function gitChanges({ cwd }) {
  if (!cwd || !fs.existsSync(cwd)) throw httpError(400, `התיקייה לא קיימת: ${cwd}`);
  const status = await git(cwd, ['status', '--porcelain=v1', '--branch']);
  if (!status.ok) return { isRepo: false, error: status.stderr.trim() };
  const [diff, staged] = await Promise.all([git(cwd, ['diff', ...SAFE_DIFF]), git(cwd, ['diff', '--cached', ...SAFE_DIFF])]);
  const fullDiff = `${staged.stdout}${diff.stdout}`;
  return {
    isRepo: true,
    branch: (status.stdout.match(/^## (.*)$/m) || [, ''])[1],
    files: status.stdout.split('\n').filter(line => line && !line.startsWith('##'))
      .map(line => ({ status: line.slice(0, 2).trim(), path: line.slice(3) })),
    diff: fullDiff.slice(0, MAX_DIFF_CHARS),
    truncated: fullDiff.length > MAX_DIFF_CHARS,
  };
}

const isDirectory = target => { try { return fs.statSync(target).isDirectory(); } catch { return false; } };

/** Drives that exist on Windows (C:\, D:\, ...); "/" elsewhere. */
function rootFolders() {
  if (process.platform !== 'win32') return ['/'];
  return [...'CDEFGHIJKLMNOPQRSTUVWXYZAB'].map(letter => `${letter}:\\`).filter(fs.existsSync);
}

/**
 * Sub-folders of one folder, for picking a working folder (files are not listed).
 * @param {{path?:string, hidden?:string, fallback?:boolean}} query hidden=1 also lists dot-folders;
 *   fallback: the path was not chosen by the user (defaultCwd), so a missing one opens the home folder instead.
 * @returns {{path:string, parent:string|null, folders:string[], truncated:boolean, roots:string[], home:string, isRepo:boolean}}
 * @example listFolders({ path: 'C:\\Users' })
 */
function listFolders({ path: folder, hidden, fallback = false } = {}) {
  let target = path.resolve(folder || os.homedir());
  if (fallback && !isDirectory(target)) target = os.homedir();
  if (!isDirectory(target)) throw httpError(400, `התיקייה לא קיימת: ${target}`);
  let children;
  try { children = fs.readdirSync(target, { withFileTypes: true }); } catch (error) {
    throw httpError(403, `אין גישה לתיקייה: ${target} (${error.code || error.message})`);
  }
  const folders = children
    .filter(child => child.isDirectory() || (child.isSymbolicLink() && isDirectory(path.join(target, child.name))))
    .map(child => child.name)
    // Dot-folders and Windows system folders ($Recycle.Bin, System Volume Information) are noise here.
    .filter(name => hidden === '1' || !(name.startsWith('.') || name.startsWith('$') || name === 'System Volume Information'))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  const parent = path.dirname(target);
  return {
    path: target, parent: parent === target ? null : parent, folders: folders.slice(0, MAX_FOLDERS),
    truncated: folders.length > MAX_FOLDERS, roots: rootFolders(), home: os.homedir(),
    isRepo: fs.existsSync(path.join(target, '.git')),
  };
}

/** Creates one sub-folder (the folder browser's "new folder"). @returns {{path:string}} */
function createFolder({ path: parentFolder, name }) {
  const clean = String(name || '').trim();
  if (!FOLDER_NAME.test(clean) || clean === '.' || clean === '..') throw httpError(400, `שם תיקייה לא תקין: ${clean}`);
  if (!parentFolder || !isDirectory(parentFolder)) throw httpError(400, `התיקייה לא קיימת: ${parentFolder}`);
  const target = path.join(path.resolve(parentFolder), clean);
  if (fs.existsSync(target)) throw httpError(409, `כבר קיים: ${target}`);
  fs.mkdirSync(target);
  return { path: target };
}

module.exports = { searchFiles, gitChanges, listFolders, createFolder };
