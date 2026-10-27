/**
 * Builds the argument list for one long-lived `claude -p` process in stream-json mode.
 * Every optional flag is checked against the detected capabilities, so older CLIs still start.
 */
const fs = require('fs');
const path = require('path');
const { cliPermissionMode, hasFlag } = require('./cli-capabilities');
const { uploadsDir } = require('./uploads');

const SETTINGS_DIR = path.join(process.env.CLAUDE_GUI_DATA || path.join(__dirname, '..', 'data'), 'session-settings');

/**
 * Per-session settings go through a file, not a JSON argument: cmd.exe mangles quotes in arguments.
 * @returns {string|null} path of the written file, or null when the session has no extra settings.
 */
function writeSessionSettings(session) {
  const settings = {};
  if (session.outputStyle) settings.outputStyle = session.outputStyle;
  if (!Object.keys(settings).length) return null;
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  const file = path.join(SETTINGS_DIR, `${session.id}.json`);
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  return file;
}

/**
 * @param {object} session Store session (mode, model, effort, agent, addDirs, outputStyle, claudeSessionId, forkPending).
 * @param {{model:string}} config
 * @param {{flags:string[], permissionModes:string[]}} capabilities
 * @returns {string[]}
 * @example buildArgs({ mode: 'plan', addDirs: [] }, { model: '' }, capabilities)
 */
function buildArgs(session, config, capabilities) {
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
  const supports = flag => hasFlag(capabilities, flag);
  if (supports('--include-partial-messages')) args.push('--include-partial-messages');
  // Permission prompts reach the GUI (as can_use_tool control requests) only with the stdio prompt tool.
  // Without it, 2.1.x denies them ("you haven't granted it yet") even though --permission-prompts defaults to "host".
  args.push('--permission-prompt-tool', 'stdio');
  // A live switch into bypass mode may be refused; the runtime then restarts the process with this flag.
  args.push('--permission-mode', cliPermissionMode(session.mode, capabilities));

  const model = session.model || config.model;
  if (model) args.push('--model', model);
  if (session.effort && supports('--effort')) args.push('--effort', session.effort);
  if (session.agent && supports('--agent')) args.push('--agent', session.agent);
  for (const dir of session.addDirs || []) args.push('--add-dir', dir);
  // Files attached in the GUI live here; Claude reads them without a permission prompt.
  if (supports('--add-dir')) args.push('--add-dir', uploadsDir());

  const settingsFile = writeSessionSettings(session);
  if (settingsFile) args.push('--settings', settingsFile);

  if (session.claudeSessionId) {
    args.push('--resume', session.claudeSessionId);
    if (session.forkPending && supports('--fork-session')) args.push('--fork-session');
  }
  return args;
}

module.exports = { buildArgs };
