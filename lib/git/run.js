/**
 * Runs git safely: programs a repository can configure (fsmonitor, external diff, textconv) are off. Used read-only by
 * the GUI's views; the one write is a session's worktree (worktree.js), where the repository's own hooks do run.
 */
const { execFile } = require('child_process');

/**
 * A repository's own config can make git run programs (fsmonitor, external diff, textconv filters),
 * and the folder may be one nobody reviewed, so those are switched off.
 */
// core.quotepath=false: Hebrew and other non-ASCII file names come out as they are, not as octal escapes.
const SAFE_GIT = ['-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'diff.external=', '--no-pager'];
const SAFE_DIFF = ['--no-ext-diff', '--no-textconv'];

/**
 * @param {string} cwd
 * @param {string[]} args git arguments after the safety flags
 * @param {{timeoutMs?:number}} [options] timeoutMs: kill git after this long (0: no limit)
 * @returns {Promise<{ok:boolean, stdout:string, stderr:string, timedOut:boolean}>} never rejects (an invalid cwd is ok:false)
 * @example await git(folder, ['status', '--porcelain=v1'])
 */
function git(cwd, args, { timeoutMs = 0 } = {}) {
  return new Promise(resolve => {
    try {
      const child = execFile('git', [...SAFE_GIT, ...args], {
        cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true, encoding: 'utf8', timeout: timeoutMs,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      }, (error, stdout, stderr) => resolve({
        ok: !error, stdout: stdout || '', stderr: stderr || (error?.message ?? ''), timedOut: Boolean(error?.killed),
      }));
      child.stdin?.end(); // nothing to read: a hook that waits for input must not hang the request
    } catch (error) { // execFile throws at once for a cwd that is not a string or has a NUL byte
      resolve({ ok: false, stdout: '', stderr: error.message, timedOut: false });
    }
  });
}

module.exports = { git, SAFE_DIFF };
