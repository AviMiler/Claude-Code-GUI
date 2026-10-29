/**
 * Per-session options that reach the CLI as flags: how a PATCH of them is checked, and how a session's values become
 * arguments. One place for them, so a new option is one entry here (and a field in the store), not changes in three files.
 */
const { httpError } = require('./http-utils');

const TEXT_KEYS = ['model', 'effort', 'agent', 'outputStyle']; // trimmed text, passed on as given
// A model id: letters, digits and . _ : / @ + [ ] -, not starting with a dash, no spaces, quotes or cmd.exe metacharacters (%, &, |, <, >, ^).
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+[\]-]{0,127}$/;

/** The model the CLI will start with: the session's own, else the configured one ('' when neither is named). */
const mainModel = (session, config) => session.model || config.model || '';

/**
 * @param {object} patch the request body @param {object} current the session as stored @param {{model:string}} config
 * @returns {object} the changes to store (only the keys the patch carried)
 * @throws {Error} 400 for a fallback model that is not a model id, or that is the main model itself (the CLI refuses that)
 */
function textChanges(patch, current, config) {
  const changes = {};
  for (const key of TEXT_KEYS) if (typeof patch[key] === 'string') changes[key] = patch[key].trim();
  if (typeof patch.fallbackModel === 'string') {
    const value = patch.fallbackModel.trim();
    if (value && !MODEL_ID.test(value)) throw httpError(400, 'שם מודל הגיבוי לא תקין (אותיות לטיניות, ספרות ו-. _ : / @ + - בלבד)');
    if (value && value === mainModel({ ...current, ...changes }, config)) throw httpError(400, 'מודל הגיבוי חייב להיות שונה מהמודל הראשי');
    changes.fallbackModel = value;
  }
  return changes;
}

/**
 * @param {object} session @param {{model:string}} config @param {(flag:string)=>boolean} supports does the installed CLI list the flag
 * @returns {string[]} flags and values, each value its own argument (never joined into a shell string)
 */
function optionArgs(session, config, supports) {
  const fallback = session.fallbackModel;
  // Equal to the main model (changed later): left out, the CLI would refuse to start.
  return fallback && supports('--fallback-model') && fallback !== mainModel(session, config) ? ['--fallback-model', fallback] : [];
}

module.exports = { textChanges, optionArgs };
