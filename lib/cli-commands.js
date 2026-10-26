/**
 * Runs management subcommands of the CLI (`claude mcp ...`, `claude plugin ...`, `claude doctor`...).
 * Why a whitelist of commands AND of their options: the browser sends the argument list, and only these
 * command families with the options the panels use are meant to be reachable (no --settings, --debug-file, ...).
 */
const fs = require('fs');
const { runClaude } = require('./spawn-utils');
const { httpError } = require('./http-utils');

const SCOPE = ['--scope', '-s'];
/** Command prefix -> options allowed after it. Positional values (names, URLs) are always allowed. */
const ALLOWED = [
  { prefix: ['mcp', 'list'], options: [] },
  { prefix: ['mcp', 'get'], options: [] },
  { prefix: ['mcp', 'add'], options: ['--transport', '-t', ...SCOPE, '--env', '-e', '--header', '-H'], passThrough: true },
  { prefix: ['mcp', 'add-json'], options: SCOPE },
  { prefix: ['mcp', 'remove'], options: SCOPE },
  { prefix: ['plugin', 'list'], options: ['--json', '--available'] },
  { prefix: ['plugin', 'install'], options: SCOPE },
  { prefix: ['plugin', 'uninstall'], options: SCOPE },
  { prefix: ['plugin', 'enable'], options: SCOPE },
  { prefix: ['plugin', 'disable'], options: SCOPE },
  { prefix: ['plugin', 'update'], options: SCOPE },
  { prefix: ['plugin', 'details'], options: [] },
  { prefix: ['plugin', 'marketplace', 'list'], options: ['--json'] },
  { prefix: ['plugin', 'marketplace', 'add'], options: [] },
  { prefix: ['plugin', 'marketplace', 'remove'], options: [] },
  { prefix: ['plugin', 'marketplace', 'update'], options: [] },
  { prefix: ['doctor'], options: [] },
  { prefix: ['auth', 'status'], options: ['--text', '--json'] },
];
const MAX_ARGS = 60;

/**
 * @param {string[]} args
 * @returns {string|null} why the arguments are refused, or null when they are allowed.
 * @example refusal(['mcp', 'list', '--debug-file', 'x']) // 'אפשרות לא מותרת: --debug-file'
 */
function refusal(args) {
  const entry = ALLOWED.find(({ prefix }) => prefix.every((part, index) => args[index] === part));
  if (!entry) return `פקודה לא מותרת: claude ${args.slice(0, 3).join(' ')}`;
  const rest = args.slice(entry.prefix.length);
  // For `mcp add`, everything after "--" is the server's own command line and is passed through.
  const separator = entry.passThrough ? rest.indexOf('--') : -1;
  const checked = separator >= 0 ? rest.slice(0, separator) : rest;
  const bad = checked.find(arg => arg.startsWith('-') && !entry.options.includes(arg.split('=')[0]));
  return bad ? `אפשרות לא מותרת: ${bad}` : null;
}

/**
 * @param {object} config
 * @param {{args:string[], cwd?:string}} body
 * @returns {Promise<{code:number|null, stdout:string, stderr:string, error:string|null, json:any}>}
 * @example await runCliCommand(config, { args: ['plugin', 'list', '--json'] })
 */
async function runCliCommand(config, { args, cwd }) {
  if (!Array.isArray(args) || !args.length || args.length > MAX_ARGS || !args.every(arg => typeof arg === 'string')) {
    throw httpError(400, 'רשימת ארגומנטים לא תקינה');
  }
  const refused = refusal(args);
  if (refused) throw httpError(403, refused);
  const folder = cwd && fs.existsSync(cwd) ? cwd : config.defaultCwd;
  const result = await runClaude(config, args, { cwd: folder, timeoutMs: 180000 });
  let json = null;
  if (args.includes('--json')) {
    try { json = JSON.parse(result.stdout); } catch { json = null; }
  }
  return { ...result, json };
}

module.exports = { runCliCommand, refusal };
