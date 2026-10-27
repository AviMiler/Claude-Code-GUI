/** Uncommitted changes of a folder: the full diff for the git panel (/diff) and a small summary for the session details rail. */
const fs = require('fs');
const { git, SAFE_DIFF } = require('./run');
const { httpError } = require('../http-utils');

const MAX_DIFF_CHARS = 300000;

const branchOf = status => (status.match(/^## (.*)$/m) || [, ''])[1];
const changedLines = status => status.split('\n').filter(line => line && !line.startsWith('##'));

function requireFolder(cwd) {
  if (!cwd || !fs.existsSync(cwd)) throw httpError(400, `התיקייה לא קיימת: ${cwd}`);
}

/** git status + diff of uncommitted changes, staged and not (like /diff). */
async function gitChanges({ cwd }) {
  requireFolder(cwd);
  const status = await git(cwd, ['status', '--porcelain=v1', '--branch']);
  if (!status.ok) return { isRepo: false, error: status.stderr.trim() };
  const [diff, staged] = await Promise.all([git(cwd, ['diff', ...SAFE_DIFF]), git(cwd, ['diff', '--cached', ...SAFE_DIFF])]);
  const fullDiff = `${staged.stdout}${diff.stdout}`;
  return {
    isRepo: true,
    branch: branchOf(status.stdout),
    files: changedLines(status.stdout).map(line => ({ status: line.slice(0, 2).trim(), path: line.slice(3) })),
    diff: fullDiff.slice(0, MAX_DIFF_CHARS),
    truncated: fullDiff.length > MAX_DIFF_CHARS,
  };
}

/** Sums `git diff --numstat` output (binary files count as changed files with no lines). */
function sumNumstat(output) {
  return output.split('\n').filter(Boolean).reduce((total, line) => {
    const [added, removed] = line.split('\t');
    return { added: total.added + (Number(added) || 0), removed: total.removed + (Number(removed) || 0) };
  }, { added: 0, removed: 0 });
}

/**
 * Branch and line counts of the uncommitted changes (staged + unstaged), plus how many files are new (untracked).
 * @param {{cwd:string}} options
 * @returns {Promise<{isRepo:boolean, branch?:string, files?:number, untracked?:number, added?:number, removed?:number}>}
 * @example await gitSummary({ cwd }) // { isRepo: true, branch: 'main...origin/main', files: 3, untracked: 1, added: 40, removed: 7 }
 */
async function gitSummary({ cwd }) {
  requireFolder(cwd);
  const status = await git(cwd, ['status', '--porcelain=v1', '--branch']);
  if (!status.ok) return { isRepo: false };
  const [unstaged, staged] = await Promise.all([git(cwd, ['diff', '--numstat', ...SAFE_DIFF]), git(cwd, ['diff', '--cached', '--numstat', ...SAFE_DIFF])]);
  const working = sumNumstat(unstaged.stdout);
  const index = sumNumstat(staged.stdout);
  const lines = changedLines(status.stdout);
  return {
    isRepo: true, branch: branchOf(status.stdout), files: lines.length,
    untracked: lines.filter(line => line.startsWith('??')).length, added: working.added + index.added, removed: working.removed + index.removed,
  };
}

module.exports = { gitChanges, gitSummary };
