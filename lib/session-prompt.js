/**
 * A session's own system prompt. The text can be long and hold any character, so it never goes through the command line
 * (cmd.exe mangles quotes and refuses %): it is written to a file and the CLI is given the file's path.
 */
const fs = require('fs');
const path = require('path');
const { httpError } = require('./http-utils');
const { DATA_DIR } = require('./session-store');

const DIR = path.join(DATA_DIR, 'session-settings');
const MAX_CHARS = 20000;
const MODES = ['append', 'replace']; // append keeps the CLI's own prompt (and its tool guidance); replace drops it
const FLAGS = { append: '--append-system-prompt-file', replace: '--system-prompt-file' };

const fileFor = id => path.join(DIR, `${id}.system-prompt.md`);

/** @returns {string} the prompt, trimmed ('' clears it) @throws {Error} 400 for something that is not text or is too long */
function checkPrompt(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw httpError(400, 'הנחיית המערכת חייבת להיות טקסט');
  if (value.length > MAX_CHARS) throw httpError(400, `הנחיית המערכת ארוכה מדי (עד ${MAX_CHARS} תווים)`);
  return value.trim();
}

const checkPromptMode = value => { if (!MODES.includes(value)) throw httpError(400, 'סוג הנחיית המערכת לא מוכר'); return value; };

/**
 * @param {{id:string, systemPrompt?:string, systemPromptMode?:string}} session @param {(flag:string)=>boolean} supports
 * @returns {string[]} the flag and the file path ([] when there is no prompt, or the CLI lacks the flag: nothing goes on the command line instead)
 */
function promptArgs(session, supports) {
  const flag = FLAGS[session.systemPromptMode === 'replace' ? 'replace' : 'append'];
  if (!session.systemPrompt || !supports(flag)) return [];
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileFor(session.id), session.systemPrompt);
  return [flag, fileFor(session.id)];
}

function removePromptFile(id) { fs.rm(fileFor(id), { force: true }, () => {}); }

module.exports = { checkPrompt, checkPromptMode, promptArgs, removePromptFile };
