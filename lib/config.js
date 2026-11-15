const fs = require('fs');
const os = require('os');
const path = require('path');

// CLAUDE_GUI_CONFIG lets a developer point at another file (e.g. dev/config.fake.json) without touching config.json.
const CONFIG_PATH = process.env.CLAUDE_GUI_CONFIG || path.join(__dirname, '..', 'config.json');
// stallSeconds: the working line's "N שניות מאז הטוקן האחרון" (public/js/stall/); modelGate: true | false | "auto" (lib/model-gate/).
const DEFAULTS = { port: 3737, claudePath: 'claude', model: '', defaultCwd: '', idleMinutes: 20, loopRepeat: 3, env: {}, stallSeconds: 60, modelGate: 'auto', verifyMaxAttempts: 3 };

/** A wrong value falls back to its default, with a line in the log. */
function checkValues(config) {
  if (!(Number.isFinite(config.stallSeconds) && config.stallSeconds >= 5)) {
    console.error(`[config] stallSeconds must be a number >= 5, using ${DEFAULTS.stallSeconds}`);
    config.stallSeconds = DEFAULTS.stallSeconds;
  }
  if (![true, false, 'auto'].includes(config.modelGate)) {
    console.error('[config] modelGate must be true, false or "auto", using "auto"');
    config.modelGate = DEFAULTS.modelGate;
  }
}

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
  // Identical tool calls in a row that make a loop (loop-detector/); 0 = off; anything else invalid = 3.
  if (!Number.isInteger(config.loopRepeat) || config.loopRepeat < 0) config.loopRepeat = DEFAULTS.loopRepeat;
  if (!config.defaultCwd) config.defaultCwd = os.homedir();
  // Failed automatic checks per turn before Claude is let stop (lib/verify/): a whole number 1..10.
  const attempts = Number(config.verifyMaxAttempts);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
    console.error('[config] verifyMaxAttempts must be a whole number from 1 to 10; using 3');
    config.verifyMaxAttempts = DEFAULTS.verifyMaxAttempts;
  } else config.verifyMaxAttempts = attempts;
  checkValues(config);
  // A relative path with a folder in it (e.g. dev/fake-claude.cmd) is relative to the project, not to each session folder.
  if (/[\\/]/.test(config.claudePath) && !path.isAbsolute(config.claudePath)) {
    config.claudePath = path.resolve(__dirname, '..', config.claudePath);
  }
  return config;
}

module.exports = { loadConfig, CONFIG_PATH };
