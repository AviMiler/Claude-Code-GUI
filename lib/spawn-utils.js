/**
 * How to start the configured `claude` binary on every platform.
 * Why: on Windows, .cmd/.bat shims (npm installs) can only be started through cmd.exe,
 * and cmd.exe needs its own quoting for arguments with spaces.
 */
const { execFile } = require('child_process');

const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g;
const SAFE_CMD_ARG = /^[\w\-.:\\/=@,+]+$/;

const needsShell = claudePath => process.platform === 'win32' && !/\.exe$/i.test(claudePath);

/**
 * Quotes one argument for cmd.exe. Quotes inside are doubled, which the MS C runtime reads as a literal quote.
 * "%" is refused: cmd.exe expands %NAME% even inside quotes, so the argument would change (and could leak env values).
 */
function quoteForCmd(arg) {
  if (String(arg).includes('%')) throw new Error(`ארגומנט עם % לא נתמך כש-claudePath הוא קובץ .cmd: ${arg}`);
  return SAFE_CMD_ARG.test(arg) ? arg : `"${String(arg).replace(/"/g, '""')}"`;
}

/**
 * @param {{claudePath:string, env:object}} config
 * @param {string[]} args
 * @returns {{command:string, args:string[], options:{shell:boolean, env:object, windowsHide:boolean}}}
 * @example const { command, args, options } = commandFor(config, ['--version']);
 */
function commandFor(config, args) {
  const shell = needsShell(config.claudePath);
  // Quote only when needed: cmd.exe gives a quoted batch file the wrong %~dp0 (the cwd instead of its own folder).
  const command = shell && /\s/.test(config.claudePath) ? `"${config.claudePath}"` : config.claudePath;
  return {
    command,
    args: shell ? args.map(quoteForCmd) : args,
    options: { shell, env: { ...process.env, ...config.env }, windowsHide: true },
  };
}

/**
 * Runs `claude <args>` to completion (stdin closed) and resolves with its output. Never rejects.
 * @param {object} config
 * @param {string[]} args
 * @param {{cwd?:string, timeoutMs?:number}} [options]
 * @returns {Promise<{code:number|null, stdout:string, stderr:string, error:string|null}>}
 * @example const { stdout } = await runClaude(config, ['mcp', 'list'], { cwd });
 */
function runClaude(config, args, { cwd, timeoutMs = 120000 } = {}) {
  const spec = commandFor(config, args);
  return new Promise(resolve => {
    const child = execFile(spec.command, spec.args, {
      ...spec.options, cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8',
    }, (error, stdout, stderr) => {
      const clean = text => String(text || '').replace(ANSI_PATTERN, '');
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : null) : 0,
        stdout: clean(stdout), stderr: clean(stderr),
        error: error && typeof error.code !== 'number' ? error.message : null,
      });
    });
    child.stdin?.end();
  });
}

module.exports = { commandFor, runClaude, needsShell, ANSI_PATTERN };
