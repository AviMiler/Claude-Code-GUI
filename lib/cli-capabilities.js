/**
 * Detects what the configured CLI version supports by reading `claude --help` and `claude --version`.
 * Why: the GUI must run against whatever version is installed (2.1.x here, possibly older at work),
 * so flags are only passed when the help text lists them.
 */
const { runClaude } = require('./spawn-utils');

const FALLBACK_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
let cache = null; // { key, promise }

/**
 * @param {string} helpText Output of `claude --help`.
 * @param {string} versionText Output of `claude --version`.
 * @returns {{version:string|null, flags:string[], permissionModes:string[], commands:string[]}}
 * @example parseHelp('--model <model>\n--permission-mode <mode> (choices: "plan", "auto")', '2.1.0 (Claude Code)')
 */
function parseHelp(helpText, versionText) {
  const flags = [...new Set(helpText.match(/--[a-z][A-Za-z-]+/g) || [])];
  const modeBlock = helpText.match(/--permission-mode <mode>[\s\S]*?\(choices:([^)]*)\)/);
  const permissionModes = modeBlock ? [...modeBlock[1].matchAll(/"([^"]+)"/g)].map(match => match[1]) : FALLBACK_MODES;
  const commandsBlock = helpText.split(/\nCommands:\n/)[1] || '';
  const commands = [...commandsBlock.matchAll(/^ {2}([a-z][\w-]*)(?:\|[\w-]+)?\s/gm)].map(match => match[1]);
  const version = (versionText.match(/\d+\.\d+\.\d+/) || [null])[0];
  return { version, flags, permissionModes, commands };
}

async function detect(config) {
  const [help, version] = await Promise.all([
    runClaude(config, ['--help'], { timeoutMs: 30000 }),
    runClaude(config, ['--version'], { timeoutMs: 30000 }),
  ]);
  if (help.error || (!help.stdout && help.code !== 0)) {
    console.error('[cli-capabilities] cannot run --help:', help.error || help.stderr);
    return { ...parseHelp('', ''), error: help.error || help.stderr || 'claude --help failed' };
  }
  const parsed = parseHelp(help.stdout + help.stderr, version.stdout);
  console.log(`[cli-capabilities] Claude Code ${parsed.version || '?'} | modes: ${parsed.permissionModes.join(', ')}`);
  return { ...parsed, error: null };
}

/**
 * Cached per claudePath. Never rejects; on failure `error` is set and safe defaults are returned.
 * @param {{claudePath:string, env:object}} config
 * @returns {Promise<{version:string|null, flags:string[], permissionModes:string[], commands:string[], error:string|null}>}
 */
function getCapabilities(config) {
  if (cache?.key !== config.claudePath) cache = { key: config.claudePath, promise: detect(config) };
  return cache.promise;
}

/** Converts a GUI mode to one the CLI flag accepts (2.1.x renamed "default" to "manual"). */
function cliPermissionMode(mode, capabilities) {
  const choices = capabilities.permissionModes;
  if (choices.includes(mode)) return mode;
  if (mode === 'default' && choices.includes('manual')) return 'manual';
  if (mode === 'manual' && choices.includes('default')) return 'default';
  return choices.includes('default') ? 'default' : (choices.includes('manual') ? 'manual' : mode);
}

const hasFlag = (capabilities, flag) => capabilities.flags.includes(flag);

module.exports = { getCapabilities, parseHelp, cliPermissionMode, hasFlag };
