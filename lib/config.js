const fs = require('fs');
const os = require('os');
const path = require('path');
const { EDITOR_KEYS, DEFAULT_EDITOR } = require('./files/editors');

// CLAUDE_GUI_CONFIG lets a developer point at another file (e.g. dev/config.fake.json) without touching config.json.
const CONFIG_PATH = process.env.CLAUDE_GUI_CONFIG || path.join(__dirname, '..', 'config.json');
// stallSeconds: the working line's "N שניות מאז הטוקן האחרון" (public/js/stall/); modelGate: true | false | "auto" (lib/model-gate/).
const DEFAULTS = { port: 3737, claudePath: 'claude', model: '', defaultCwd: '', idleMinutes: 20, loopRepeat: 3, env: {}, stallSeconds: 60, modelGate: 'auto', verifyMaxAttempts: 3, contextWindow: 0, contextWarnPercent: 70, editor: DEFAULT_EDITOR, scheduleApprovalMinutes: 30, scheduleStallMinutes: 10 };
// editor: which program "open in editor" starts (one of EDITOR_KEYS, lib/files/editors.js).
// contextWindow: the local model's real window in tokens (0 = ask the model server); contextWarnPercent: early warning (1..100).
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

/** A wrong value falls back to its default, with a line in the log. */
function checkValues(config) {
  // scheduleApprovalMinutes: how long a scheduled run may wait for a person before it is stopped (lib/schedule/).
  if (!(Number.isFinite(config.scheduleApprovalMinutes) && config.scheduleApprovalMinutes >= 0.05 && config.scheduleApprovalMinutes <= 1440)) {
    console.error(`[config] scheduleApprovalMinutes must be a number from 0.05 to 1440, using ${DEFAULTS.scheduleApprovalMinutes}`);
    config.scheduleApprovalMinutes = DEFAULTS.scheduleApprovalMinutes;
  }
  // scheduleStallMinutes: a scheduled run silent this long is stopped (0 = never).
  const stall = config.scheduleStallMinutes;
  if (!(stall === 0 || (Number.isFinite(stall) && stall >= 0.05 && stall <= 1440))) {
    console.error(`[config] scheduleStallMinutes must be 0 or a number from 0.05 to 1440, using ${DEFAULTS.scheduleStallMinutes}`);
    config.scheduleStallMinutes = DEFAULTS.scheduleStallMinutes;
  }
  if (!(Number.isFinite(config.stallSeconds) && config.stallSeconds >= 5)) {
    console.error(`[config] stallSeconds must be a number >= 5, using ${DEFAULTS.stallSeconds}`);
    config.stallSeconds = DEFAULTS.stallSeconds;
  }
  if (!EDITOR_KEYS.includes(config.editor)) {
    console.error(`[config] editor must be one of ${EDITOR_KEYS.join(', ')}, using ${DEFAULT_EDITOR}`);
    config.editor = DEFAULT_EDITOR;
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
 * @returns {{port:number, claudePath:string, model:string, defaultCwd:string, idleMinutes:number, env:Object<string,string>, contextWindow:number, contextWarnPercent:number}}
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
  for (const [key, min, max] of [['contextWindow', 0, 100000000], ['contextWarnPercent', 1, 100]]) {
    if (!isInt(config[key], min, max)) { console.error(`[config] ${key} must be a whole number ${min}..${max}; using ${DEFAULTS[key]}`); config[key] = DEFAULTS[key]; }
  }
  // A relative path with a folder in it (e.g. dev/fake-claude.cmd) is relative to the project, not to each session folder.
  if (/[\\/]/.test(config.claudePath) && !path.isAbsolute(config.claudePath)) {
    config.claudePath = path.resolve(__dirname, '..', config.claudePath);
  }
  return config;
}

module.exports = { loadConfig, CONFIG_PATH };
