/** One git write (commit, push, merge, discard) at a time per repository (in memory: the server is the only writer it has to keep apart). */
const path = require('path');
const { httpError } = require('../http-utils');

const busy = new Set();

/**
 * @template T
 * @param {string} root the repository's top folder
 * @param {()=>Promise<T>} work
 * @returns {Promise<T>}
 * @throws httpError 409 when another commit or push of this repository is running
 */
async function withRepoLock(root, work) {
  const resolved = path.resolve(root); // "C:/x" from git and "c:\x" from path.resolve are one repository
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  if (busy.has(key)) throw httpError(409, 'פעולת git אחרת (שמירה, דחיפה, מיזוג או ביטול שינויים) עדיין רצה במאגר הזה. נסה שוב בעוד רגע.');
  busy.add(key);
  try {
    return await work();
  } finally {
    busy.delete(key);
  }
}

module.exports = { withRepoLock };
