/**
 * What the Changes pane's commit box needs to know about the session folder's repository: the files that could be
 * committed, the branch, its upstream and how far ahead it is, an operation in progress, and (in Hebrew) why a commit
 * or a push is not possible right now. The same answers guard commit.js and push.js on the server.
 */
const fs = require('fs');
const path = require('path');
const { git } = require('./run');

const MAX_FILES = 500;
const OPERATIONS = [['MERGE_HEAD', 'merge'], ['rebase-merge', 'rebase'], ['rebase-apply', 'rebase'], ['CHERRY_PICK_HEAD', 'cherry-pick'], ['REVERT_HEAD', 'revert']];
const OPERATION_TEXT = { merge: 'merge', rebase: 'rebase', 'cherry-pick': 'cherry-pick', revert: 'revert' };
const LABELS = { '?': 'חדש', A: 'נוסף', M: 'שונה', D: 'נמחק', R: 'שם שונה', C: 'הועתק', T: 'סוג שונה', U: 'קונפליקט' };

/**
 * Parses `git status --porcelain -z` (no --branch). Paths are relative to the repository's top folder.
 * @param {string} output
 * @returns {{path:string, oldPath?:string, x:string, y:string, untracked:boolean, staged:boolean, conflict:boolean, status:string}[]}
 */
function parsePorcelain(output) {
  const parts = output.split('\0');
  const files = [];
  for (let at = 0; at < parts.length; at++) {
    const entry = parts[at];
    if (entry.length < 4) continue;
    const x = entry[0];
    const y = entry[1];
    const file = { path: entry.slice(3), x, y, untracked: x === '?', staged: x !== ' ' && x !== '?' && x !== '!' };
    if (x === '!') continue;
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') file.oldPath = parts[++at]; // "XY new\0old\0"
    file.conflict = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
    file.status = LABELS[file.conflict ? 'U' : file.untracked ? '?' : (x !== ' ' ? x : y)] || 'שונה';
    files.push(file);
  }
  return files;
}

/** The operation (merge, rebase …) a repository is in the middle of, or null. */
function operationInProgress(gitDir) {
  return OPERATIONS.find(([name]) => fs.existsSync(path.join(gitDir, name)))?.[1] ?? null;
}

/** Hebrew reasons (or '') a commit and a push are blocked, from a status that has everything but the reasons. */
function reasonsFor(state) {
  const operation = state.inProgress ? `מתבצע ${OPERATION_TEXT[state.inProgress]} – סיים או בטל אותו לפני שמירה.` : '';
  let commitReason = operation;
  if (!commitReason && state.files.some(file => file.conflict)) commitReason = 'יש קבצים בקונפליקט – פתור אותם קודם.';
  if (!commitReason && !state.files.length) commitReason = 'אין שינויים לשמירה.';
  let pushReason = state.inProgress ? operation.replace('שמירה', 'דחיפה') : '';
  if (!pushReason && state.detached) pushReason = 'HEAD מנותק (אין ענף) – אי אפשר לדחוף.';
  if (!pushReason && !state.hasCommits) pushReason = 'עדיין אין commit לדחיפה.';
  if (!pushReason && !state.upstream) pushReason = state.hasOrigin ? 'לענף אין upstream.' : 'לענף אין upstream, ואין remote בשם origin.';
  return { commitReason, pushReason };
}

/**
 * @param {{cwd:string}} options the session's folder
 * @returns {Promise<object>} { isRepo, root, branch (null: detached), detached, hasCommits, upstream, ahead, behind, hasOrigin,
 *   inProgress, files: [{ path, oldPath?, status, untracked, staged, conflict }], filesTruncated, canCommit, commitReason, canPush,
 *   pushReason, canPushNewUpstream }
 * @example await commitStatus({ cwd }) // { isRepo: true, branch: 'main', ahead: 1, files: [{ path: 'a.js', status: 'שונה' }], canCommit: true, … }
 */
async function commitStatus({ cwd }) {
  const top = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return { isRepo: false };
  const root = top.stdout.trim();
  const [status, branch, head, gitDir, remotes, upstream] = await Promise.all([
    git(root, ['status', '--porcelain', '-z', '--untracked-files=all']), git(root, ['symbolic-ref', '--short', '-q', 'HEAD']),
    git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']), git(root, ['rev-parse', '--absolute-git-dir']), git(root, ['remote']),
    git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
  ]);
  if (!status.ok) return { isRepo: false, error: status.stderr.trim() };
  const all = parsePorcelain(status.stdout).filter(file => !file.path.endsWith('/')); // a nested repository ("dir/") is not committed from here
  const state = {
    isRepo: true, root, branch: branch.ok ? branch.stdout.trim() : null, detached: !branch.ok, hasCommits: head.ok,
    upstream: upstream.ok ? upstream.stdout.trim() : null, ahead: 0, behind: 0, hasOrigin: remotes.stdout.split('\n').includes('origin'),
    inProgress: gitDir.ok ? operationInProgress(gitDir.stdout.trim()) : null,
    files: all.slice(0, MAX_FILES), filesTruncated: all.length > MAX_FILES,
  };
  if (state.upstream) {
    const counts = await git(root, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
    const [behind, ahead] = counts.stdout.trim().split(/\s+/).map(Number);
    if (counts.ok) Object.assign(state, { ahead, behind });
  }
  const { commitReason, pushReason } = reasonsFor(state);
  const blocked = Boolean(state.inProgress || state.detached || !state.hasCommits);
  return {
    ...state, commitReason, pushReason, canCommit: !commitReason,
    canPush: !pushReason && state.ahead > 0, canPushNewUpstream: !blocked && !state.upstream && state.hasOrigin,
  };
}

module.exports = { commitStatus, parsePorcelain, operationInProgress };
