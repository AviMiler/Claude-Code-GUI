/**
 * Per-session options (the model panel and the session-options panel): how a PATCH of them is checked, which of them are
 * copied to a fork, and how a session's values become CLI flags. A new option is one entry here and a field in the store.
 */
const { httpError } = require('./http-utils');
const { COLOR_KEYS } = require('./session-color');
const { isForbidden } = require('./session-safe-mode');
const { checkPrompt, checkPromptMode, promptArgs } = require('./session-prompt');

const TEXT_KEYS = ['model', 'effort', 'agent', 'outputStyle']; // trimmed text, passed on as given
const FLAG_KEYS = ['thinkingOff', 'safeMode']; // true / false
const COPIED_KEYS = ['fallbackModel', 'thinkingOff', 'systemPrompt', 'systemPromptMode', 'safeMode']; // a fork keeps these (not the color)
// A model id: letters, digits and . _ : / @ + [ ] -, not starting with a dash, no spaces, quotes or cmd.exe metacharacters (%, &, |, <, >, ^).
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+[\]-]{0,127}$/;

/** The model the CLI will start with: the session's own, else the configured one ('' when neither is named). */
const mainModel = (session, config) => session.model || config.model || '';

/**
 * @param {object} patch the request body @param {object} current the session as stored @param {{model:string}} config
 * @returns {object} the changes to store (only the keys the patch carried)
 * @throws {Error} 400 for a value that does not fit its option, or a fallback model equal to the main one (the CLI refuses that)
 */
function textChanges(patch, current, config) {
  const changes = {};
  for (const key of TEXT_KEYS) if (typeof patch[key] === 'string') changes[key] = patch[key].trim();
  for (const key of FLAG_KEYS) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== 'boolean') throw httpError(400, 'ערך לא תקין');
    changes[key] = patch[key];
  }
  if (patch.systemPrompt !== undefined) changes.systemPrompt = checkPrompt(patch.systemPrompt);
  if (patch.systemPromptMode !== undefined) changes.systemPromptMode = checkPromptMode(patch.systemPromptMode);
  if (patch.color !== undefined) {
    if (patch.color !== '' && !COLOR_KEYS.includes(patch.color)) throw httpError(400, 'צבע לא מוכר');
    changes.color = patch.color;
  }
  if (changes.safeMode && isForbidden(current.mode) && patch.mode === undefined) changes.mode = 'default'; // safe mode on in a mode it forbids: back to asking
  if (typeof patch.fallbackModel === 'string') {
    const value = patch.fallbackModel.trim();
    if (value && !MODEL_ID.test(value)) throw httpError(400, 'שם מודל הגיבוי לא תקין (אותיות לטיניות, ספרות ו-. _ : / @ + - בלבד)');
    if (value && value === mainModel({ ...current, ...changes }, config)) throw httpError(400, 'מודל הגיבוי חייב להיות שונה מהמודל הראשי');
    changes.fallbackModel = value;
  }
  return changes;
}

/** The options a fork starts with. */
const copiedOptions = session => Object.fromEntries(COPIED_KEYS.filter(key => session[key] !== undefined).map(key => [key, session[key]]));

/**
 * @param {object} session @param {{model:string}} config @param {(flag:string)=>boolean} supports does the installed CLI list the flag
 * @returns {string[]} flags and values, each value its own argument (never joined into a shell string)
 */
function optionArgs(session, config, supports) {
  const fallback = session.fallbackModel;
  // Equal to the main model (changed later): left out, the CLI would refuse to start.
  const fallbackArgs = fallback && supports('--fallback-model') && fallback !== mainModel(session, config) ? ['--fallback-model', fallback] : [];
  return [...fallbackArgs, ...promptArgs(session, supports)];
}

module.exports = { textChanges, optionArgs, copiedOptions };
