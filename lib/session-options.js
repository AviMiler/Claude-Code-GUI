/**
 * Per-session options (the model panel and the session-options panel): how a PATCH of them is checked, which of them are
 * copied to a fork, and how a session's values become CLI flags. A new option is one entry here and a field in the store.
 */
const { httpError } = require('./http-utils');
const { COLOR_KEYS } = require('./session-color');
const { isForbidden } = require('./session-safe-mode');
const { checkPrompt, checkPromptMode, promptArgs } = require('./session-prompt');

const TEXT_KEYS = ['model', 'effort', 'agent', 'outputStyle']; // trimmed text, checked by checkText
const FLAG_KEYS = ['thinkingOff', 'safeMode']; // true / false
const COPIED_KEYS = ['fallbackModel', 'thinkingOff', 'systemPrompt', 'systemPromptMode', 'safeMode']; // a fork keeps these (not the color)
// A model id: letters, digits and . _ : / @ + [ ] -, not starting with a dash, no spaces, quotes or cmd.exe metacharacters (%, &, |, <, >, ^).
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+[\]-]{0,127}$/;
const ID_CHARS = '(אותיות לטיניות, ספרות ו-. _ : / @ + - בלבד)';
// The levels public/js/modes.js EFFORT_LEVELS and /effort offer, synced by hand: a level a newer CLI adds is refused until it is added here.
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// model and agent go into argv (--model, --agent) through the .cmd shim; an output style only into the --settings JSON file.
const TEXT_RULES = {
  model: { valid: value => MODEL_ID.test(value), message: `שם המודל לא תקין ${ID_CHARS}` },
  agent: { valid: value => MODEL_ID.test(value), message: `שם הסוכן לא תקין ${ID_CHARS}` },
  effort: { valid: value => EFFORTS.includes(value), message: `רמת מאמץ לא מוכרת (${EFFORTS.join(', ')})` },
  outputStyle: { valid: value => value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value), message: 'שם סגנון הפלט לא תקין' },
};

/**
 * A session's model, agent, effort or output style as given by a request (PATCH, a new session, the warm-up).
 * @param {'model'|'agent'|'effort'|'outputStyle'} key @param {unknown} value
 * @returns {string} the trimmed value; '' = not set (also for undefined / null)
 * @throws {Error} 400 for a non-string or a value its rule refuses
 * @example checkText('effort', ' high ') // 'high'
 */
function checkText(key, value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw httpError(400, 'ערך לא תקין');
  const text = value.trim();
  if (text && !TEXT_RULES[key].valid(text)) throw httpError(400, TEXT_RULES[key].message);
  return text;
}

/** The model the CLI will start with: the session's own, else the configured one ('' when neither is named). */
const mainModel = (session, config) => session.model || config.model || '';

/**
 * @param {object} patch the request body @param {object} current the session as stored @param {{model:string}} config
 * @returns {object} the changes to store (only the keys the patch carried)
 * @throws {Error} 400 for a value that does not fit its option, or a fallback model equal to the main one (the CLI refuses that)
 */
function textChanges(patch, current, config) {
  const changes = {};
  for (const key of TEXT_KEYS) if (typeof patch[key] === 'string') changes[key] = checkText(key, patch[key]);
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
    if (value && !MODEL_ID.test(value)) throw httpError(400, `שם מודל הגיבוי לא תקין ${ID_CHARS}`);
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

module.exports = { textChanges, checkText, optionArgs, copiedOptions };
