// Unit tests for the pure helpers of lib/git/worktree-paths.js (the git-calling ones, mainCheckout and listedWorktrees, are not run here).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const { WORKTREES_DIR, samePathKey, gitError } = require('../lib/git/worktree-paths');

describe('WORKTREES_DIR', () => {
  test('session worktrees live under .claude/worktrees of the repository', () => {
    assert.equal(WORKTREES_DIR, path.join('.claude', 'worktrees'));
  });
});

describe('samePathKey', () => {
  test('the same folder written two ways gives the same key', () => {
    const base = path.join(os.tmpdir(), 'repo', 'wt');
    assert.equal(samePathKey(base), samePathKey(`${base}${path.sep}`));
    assert.equal(samePathKey(path.join(base, '..', 'wt')), samePathKey(base));
  });

  test('case is ignored on Windows only', () => {
    const upper = samePathKey(path.join(os.tmpdir(), 'Repo', 'WT'));
    const lower = samePathKey(path.join(os.tmpdir(), 'repo', 'wt'));
    if (process.platform === 'win32') assert.equal(upper, lower);
    else assert.notEqual(upper, lower);
  });
});

describe('gitError', () => {
  test('the last fatal: line is the message', () => {
    assert.equal(gitError('Preparing worktree\nfatal: first\nfatal: a branch is already checked out\n'), 'fatal: a branch is already checked out');
  });

  test('an error: line counts like a fatal: line', () => {
    assert.equal(gitError('warning: x\nerror: could not lock config file\n'), 'error: could not lock config file');
  });

  test('without a fatal or error line, the last line is used', () => {
    assert.equal(gitError('line one\nline two'), 'line two');
  });

  test('Windows line endings are handled', () => {
    assert.equal(gitError('ok\r\nfatal: boom\r\n'), 'fatal: boom');
  });

  test('empty or missing output gives the generic Hebrew message', () => {
    assert.equal(gitError(''), 'שגיאה לא ידועה');
    assert.equal(gitError(undefined), 'שגיאה לא ידועה');
  });
});
