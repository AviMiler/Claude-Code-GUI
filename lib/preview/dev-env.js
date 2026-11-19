/**
 * The environment of a dev server started from the preview pane, and how its output is cleaned for the browser.
 * It starts like the Terminal pane's (`process.env` + config.json `env`), but WITHOUT secrets: the terminal hands its
 * commands the model token (ANTHROPIC_*), the CLI's variables (CLAUDE_*, CLAUDECODE), the GUI's own (CLAUDE_GUI_CONFIG,
 * CLAUDE_GUI_DATA, the verify hook's CLAUDE_GUI_VERIFY_SECRET) and every other variable whose name looks like a secret
 * (TOKEN, KEY, SECRET, AUTH, PASSWORD, CREDENTIAL: GITHUB_TOKEN, NPM_TOKEN, AWS_SECRET_ACCESS_KEY...), from the GUI's own
 * environment and from config.json alike. A dev server is a project's program, so none of that reaches it. The
 * configuration's own `env` (shown with its values in the confirmation) is added last. On Windows the child also gets
 * NoDefaultCurrentDirectoryInExePath=1, so a .cmd shim (npm.cmd calls `node`) does not pick a program from the project.
 */
const { ANSI_PATTERN } = require('../spawn-utils');

const SCRUBBED_PREFIX = /^(ANTHROPIC_|CLAUDE_|CLAUDECODE$)/i;
const SECRET_NAME = /TOKEN|SECRET|PASSWORD|PASSWD|KEY|AUTH|CREDENTIAL/i;
const MIN_SECRET_CHARS = 8; // shorter values would blank common words in the log

/** True for a variable a dev server never gets from the GUI's environment. @param {string} name */
const isScrubbed = name => SCRUBBED_PREFIX.test(name) || SECRET_NAME.test(name);

/**
 * @param {{env?:object}} config the GUI's config @param {object} own the configuration's `env` (validated)
 * @param {object} [base] the server's environment (tests pass their own)
 * @returns {{env:object, secrets:string[]}} secrets: the removed values, to blank in the log
 */
function devServerEnv(config, own, base = process.env) {
  const env = {};
  const secrets = [];
  const take = (name, value) => {
    if (isScrubbed(name)) { if (typeof value === 'string' && value.length >= MIN_SECRET_CHARS) secrets.push(value); delete env[name]; return; }
    env[name] = value;
  };
  for (const [name, value] of Object.entries(base)) take(name, value);
  for (const [name, value] of Object.entries(config.env || {})) take(name, String(value));
  Object.assign(env, own);
  if (process.platform === 'win32') env.NoDefaultCurrentDirectoryInExePath = '1';
  return { env, secrets };
}

/**
 * One line of output as the pane shows it: no ANSI codes, `user:password@` of URLs hidden (like git output, git/push.js),
 * any scrubbed secret blanked.
 * @param {string} line @param {string[]} secrets @returns {string}
 */
function redactLine(line, secrets) {
  let text = String(line).replace(ANSI_PATTERN, '').replace(/\/\/[^/@\s]+@/g, '//***@');
  for (const secret of secrets) if (text.includes(secret)) text = text.split(secret).join('***');
  return text;
}

module.exports = { devServerEnv, redactLine, isScrubbed };
