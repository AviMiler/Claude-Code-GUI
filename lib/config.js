const fs = require('fs');
const os = require('os');
const path = require('path');

// CLAUDE_GUI_CONFIG lets a developer point at another file (e.g. dev/config.fake.json) without touching config.json.
const CONFIG_PATH = process.env.CLAUDE_GUI_CONFIG || path.join(__dirname, '..', 'config.json');
const DEFAULTS = { port: 3737, claudePath: 'claude', model: '', defaultCwd: '', idleMinutes: 20, env: {} };

/**
 * Parses config.json. Windows paths are often written with single backslashes (invalid JSON),
 * so on failure every run of backslashes is normalized to one escaped backslash and parsing is retried.
 * @param {string} text Raw file content.
 * @returns {object}
 * @example parseConfigText('{"claudePath":"C:\\tools\\claude.exe"}')
 */
function parseConfigText(text) {
  const clean = text.replace(/^\uFEFF/, ''); // Notepad may save a BOM
  try {
    return JSON.parse(clean);
  } catch {
    return JSON.parse(clean.replace(/\\+/g, '\\\\'));
  }
}

/**
 * Loads config.json and fills in defaults.
 * @returns {{port:number, claudePath:string, model:string, defaultCwd:string, idleMinutes:number, env:Object<string,string>}}
 * @example const config = loadConfig(); // config.claudePath === 'claude' unless overridden
 */
function loadConfig() {
  let fileConfig = {};
  try {
    fileConfig = parseConfigText(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[config] cannot read config.json:', error.message);
  }
  const config = { ...DEFAULTS, ...fileConfig };
  if (!config.defaultCwd) config.defaultCwd = os.homedir();
  // A relative path with a folder in it (e.g. dev/fake-claude.cmd) is relative to the project, not to each session folder.
  if (/[\\/]/.test(config.claudePath) && !path.isAbsolute(config.claudePath)) {
    config.claudePath = path.resolve(__dirname, '..', config.claudePath);
  }
  return config;
}

module.exports = { loadConfig, CONFIG_PATH };
