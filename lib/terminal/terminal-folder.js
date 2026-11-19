/** The folder a new terminal opens in when the user asks for one ("open in terminal"): resolved here, never trusted. */
const fs = require('fs');
const path = require('path');
const { httpError } = require('../http-utils');
const { resolveInside, rootsOf } = require('../files/safe-path');

/**
 * @param {{cwd:string, addDirs?:string[]}} session
 * @param {unknown} requested a folder (or a file: its folder) as the browser knows it, absolute or relative to the session's folder
 * @returns {string} the real path of an existing directory inside one of the session's folders
 * @throws {Error} 400 / 403 / 404 with a Hebrew message
 */
function resolveTerminalFolder(session, requested) {
  const roots = rootsOf(session);
  if (!roots.length) throw httpError(409, 'תיקיית הסשן לא קיימת');
  const real = resolveInside(roots, session.cwd, requested);
  if (fs.statSync(real).isDirectory()) return real;
  const parent = path.dirname(real); // a file inside a root always has its folder inside the same root
  return resolveInside(roots, session.cwd, parent);
}

module.exports = { resolveTerminalFolder };
