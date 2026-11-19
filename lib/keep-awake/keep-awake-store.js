/**
 * The keep-awake switch in the GUI's data folder (`keep-awake.json`: { version: 1, enabled }). config.json's `keepAwake`
 * is only the default until the user flips the switch; the GUI never writes config.json. A missing or corrupt file
 * gives the default (readFileSafe keeps a corrupt one aside and tries the .bak).
 */
const realFs = require('fs');
const path = require('path');
const { writeFileSafe, readFileSafe } = require('../safe-file');

/**
 * @param {{file:string, defaultEnabled:boolean, fs?:object}} options
 * @returns {{get:()=>boolean, set:(enabled:boolean)=>void}}
 */
function createKeepAwakeStore({ file, defaultEnabled, fs = realFs }) {
  const parse = text => {
    const saved = JSON.parse(text);
    if (typeof saved?.enabled !== 'boolean') throw new Error('not a keep-awake file');
    return saved;
  };
  let enabled = readFileSafe(file, parse, { fs }).value?.enabled ?? Boolean(defaultEnabled);
  return {
    get: () => enabled,
    set(value) {
      enabled = Boolean(value);
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        writeFileSafe(file, JSON.stringify({ version: 1, enabled }), { fs, backup: 'sibling' });
      } catch (error) { console.error('[keep-awake] cannot save the switch:', error.message); }
    },
  };
}

module.exports = { createKeepAwakeStore };
