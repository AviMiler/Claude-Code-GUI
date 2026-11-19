/**
 * What the Changes pane needs to offer "ביטול השינויים בקובץ": for each file it shows, the file's `git status` code and
 * a fingerprint of the file's part of the diff. The browser sends both back with the request, and discard-file.js
 * computes them again: a file that changed since it was shown is not touched.
 */
const { git } = require('./run');
const { sessionDiff } = require('./session-diff');
const { fileHashes } = require('./diff-sections');
const { parsePorcelain } = require('./commit-status');

/**
 * @param {string} root the repository's top folder
 * @returns {Promise<{ok:boolean, entries:object[]}>} parsePorcelain entries (a nested repository's "dir/" left out)
 */
async function statusEntries(root) {
  const status = await git(root, ['status', '--porcelain', '-z', '--untracked-files=all']);
  return { ok: status.ok, entries: status.ok ? parsePorcelain(status.stdout).filter(file => !file.path.endsWith('/')) : [] };
}

/**
 * The status entry a path of the pane stands for: its own, or the rename it is the old name of (when git's diff did not
 * pair a rename, the pane shows the old name as a deleted file).
 * @param {object[]} entries @param {string} relative
 * @returns {object|null} null: none, or more than one (the pane cannot say which)
 */
function entryFor(entries, relative) {
  const own = entries.filter(file => file.path === relative);
  if (own.length) return own.length === 1 ? own[0] : null;
  const renamed = entries.filter(file => file.oldPath === relative && (file.x === 'R' || file.y === 'R'));
  return renamed.length === 1 ? renamed[0] : null;
}

/** @param {object} entry @returns {string} the two-letter status code, e.g. " M", "A ", "??" */
const codeOf = entry => `${entry.x}${entry.y}`;

/**
 * @param {string} root @param {string} diff the diff text the pane gets
 * @returns {Promise<Object<string, {status:string, hash:string, conflict:boolean, path:string, oldPath:string|null}>>} keyed by
 *   the pane's path (path/oldPath: the status entry's names; a rename's old name points at the rename); a file that cannot
 *   be discarded as one piece (no single entry or section) is left out
 */
async function fileStates(root, diff) {
  const [{ entries }, hashes] = await Promise.all([statusEntries(root), fileHashes(diff)]);
  const states = {};
  for (const [relative, hash] of hashes) {
    const entry = hash && entryFor(entries, relative);
    if (entry) states[relative] = { status: codeOf(entry), hash, conflict: entry.conflict, path: entry.path, oldPath: entry.oldPath ?? null };
  }
  return states;
}

/**
 * The Changes pane's diff (session-diff.js) plus `fileStates`.
 * @param {{cwd:string}} options the session's folder
 * @returns {Promise<object>} sessionDiff's answer and, in a repository, fileStates
 * @example await paneDiff({ cwd }) // { isRepo: true, diff, root, fileStates: { 'a.js': { status: ' M', hash: '…', conflict: false } } }
 */
async function paneDiff({ cwd }) {
  const result = await sessionDiff({ cwd });
  return result.isRepo ? { ...result, fileStates: await fileStates(result.root, result.diff) } : result;
}

module.exports = { statusEntries, entryFor, codeOf, paneDiff };
