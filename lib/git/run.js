/** Runs git safely for the GUI's read-only views: programs a repository can configure (fsmonitor, external diff, textconv) are off. */
const { execFile } = require('child_process');

/**
 * A repository's own config can make git run programs (fsmonitor, external diff, textconv filters),
 * and the folder may be one nobody reviewed, so those are switched off.
 */
const SAFE_GIT = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'diff.external=', '--no-pager'];
const SAFE_DIFF = ['--no-ext-diff', '--no-textconv'];

/**
 * @param {string} cwd
 * @param {string[]} args git arguments after the safety flags
 * @returns {Promise<{ok:boolean, stdout:string, stderr:string}>} never rejects
 * @example await git(folder, ['status', '--porcelain=v1'])
 */
function git(cwd, args) {
  return new Promise(resolve => {
    execFile('git', [...SAFE_GIT, ...args], {
      cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true, encoding: 'utf8',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    },
      (error, stdout, stderr) => resolve({ ok: !error, stdout: stdout || '', stderr: stderr || (error?.message ?? '') }));
  });
}

module.exports = { git, SAFE_DIFF };
