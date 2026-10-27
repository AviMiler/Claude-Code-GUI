/**
 * The Changes pane's diff: everything not yet committed in the session folder's repository against HEAD (staged and
 * unstaged in one diff per file), plus new files that git does not track yet, shown as added files.
 */
const fs = require('fs');
const path = require('path');
const { git, SAFE_DIFF } = require('./run');

const MAX_DIFF_CHARS = 300000;
const MAX_NEW_FILES = 100;
const MAX_NEW_FILE_BYTES = 512 * 1024;
const MAX_NEW_TOTAL_BYTES = 2 * 1024 * 1024; // read on the request: keep it small
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // git's empty tree: the base of a repository without commits
// Fixed a/ b/ prefixes whatever the user's diff.noprefix / diff.mnemonicPrefix say: the pane's parser relies on them.
const DIFF = ['diff', ...SAFE_DIFF, '--src-prefix=a/', '--dst-prefix=b/'];

/** A new (untracked) file as a unified diff that adds every line; null when it is skipped (symlink, too big, unreadable). */
function addedFileDiff(top, relative, budget) {
  let buffer;
  try {
    const stat = fs.lstatSync(path.join(top, relative)); // a symlink is not followed: it could point outside the folder
    if (!stat.isFile() || stat.size > MAX_NEW_FILE_BYTES || stat.size > budget.left) return null;
    buffer = fs.readFileSync(path.join(top, relative));
    budget.left -= stat.size;
  } catch {
    return null;
  }
  const header = `diff --git a/${relative} b/${relative}\nnew file mode 100644\n`;
  if (!buffer.length) return header; // an empty file has no lines (like git)
  if (buffer.subarray(0, 8192).includes(0)) return `${header}Binary files /dev/null and b/${relative} differ\n`;
  const lines = buffer.toString('utf8').replace(/\n$/, '').split('\n');
  return `${header}--- /dev/null\n+++ b/${relative}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(line => `+${line}`).join('\n')}\n`;
}

/**
 * @param {{cwd:string}} options the session's folder (may be a subfolder of its repository: the whole repository is shown)
 * @returns {Promise<{isRepo:boolean, diff?:string, truncated?:boolean, newFilesSkipped?:number}>}
 * @example await sessionDiff({ cwd }) // { isRepo: true, diff: 'diff --git a/app.js b/app.js\n…', truncated: false, newFilesSkipped: 0 }
 */
async function sessionDiff({ cwd }) {
  const top = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return { isRepo: false };
  const root = top.stdout.trim();
  const head = await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  // "--": a file named HEAD must not make the revision ambiguous.
  const tracked = (await git(root, [...DIFF, head.ok ? 'HEAD' : EMPTY_TREE, '--'])).stdout;
  const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).stdout.split('\0').filter(Boolean);
  const budget = { left: MAX_NEW_TOTAL_BYTES };
  const added = untracked.slice(0, MAX_NEW_FILES).map(relative => addedFileDiff(root, relative, budget));
  const diff = `${tracked}${added.filter(part => part !== null).join('')}`;
  const skipped = Math.max(0, untracked.length - MAX_NEW_FILES) + added.filter(part => part === null).length;
  return { isRepo: true, diff: diff.slice(0, MAX_DIFF_CHARS), truncated: diff.length > MAX_DIFF_CHARS, newFilesSkipped: skipped };
}

module.exports = { sessionDiff };
