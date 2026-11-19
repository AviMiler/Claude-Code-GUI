/**
 * The Changes pane's "whole branch" view for a worktree session: everything the session changed since its branch left
 * the project's current branch (the merge target of merge-status.js): commits, uncommitted edits and new files, as one
 * diff against `git merge-base <target> HEAD`. The base is computed here from the stored session, never from a request.
 */
const fs = require('fs');
const { git } = require('./run');
const { sessionDiff } = require('./session-diff');
const { httpError } = require('../http-utils');

/** @param {object} session @returns {Promise<{target:string|null, base:string|null, reason:string}>} the project's branch and the merge base, or why not */
async function resolveBase(session) {
  const tree = session.worktree;
  if (!tree) return { target: null, base: null, reason: 'הסשן אינו רץ ב-worktree.' };
  if (!fs.existsSync(tree.path)) return { target: null, base: null, reason: `תיקיית ה-worktree לא קיימת: ${tree.path}` };
  const head = await git(tree.root, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const target = head.ok ? head.stdout.trim() : '';
  if (!target) return { target: null, base: null, reason: 'בתיקיית הפרויקט HEAD מנותק (אין ענף יעד להשוואה).' };
  const merged = await git(tree.path, ['merge-base', `refs/heads/${target}`, 'HEAD']);
  const base = merged.stdout.trim();
  if (!merged.ok || !/^[0-9a-f]{40,64}$/.test(base)) return { target, base: null, reason: `אין בסיס משותף לענף ${target}.` };
  return { target, base, reason: '' };
}

/**
 * What the pane's toggle needs.
 * @param {object} session @returns {Promise<{target:string|null, canCompare:boolean, reason:string}>}
 * @example await branchInfo(session) // { target: 'main', canCompare: true, reason: '' }
 */
async function branchInfo(session) {
  const { target, base, reason } = await resolveBase(session);
  return { target, canCompare: Boolean(base), reason };
}

/**
 * @param {object} session a stored session @returns {Promise<object>} the pane's diff answer (like paneDiff, without fileStates) plus `mode: 'branch'`, `target` and `branchView` (what branchInfo gives)
 * @throws {Error} HTTP 409 (Hebrew) when the session has no worktree or the base cannot be found
 * @example await branchDiff(session) // { isRepo: true, diff, root, mode: 'branch', target: 'main' }
 */
async function branchDiff(session) {
  const { target, base, reason } = await resolveBase(session);
  if (!base) throw httpError(409, reason);
  const result = await sessionDiff({ cwd: session.cwd, base });
  return { ...result, mode: 'branch', target, branchView: { target, canCompare: true, reason: '' } };
}

module.exports = { branchDiff, branchInfo };
