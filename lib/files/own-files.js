/**
 * Is this file one of the GUI's own files (its data folder, its config.json) under another name? A hard link inside a
 * project to e.g. `<data>/backups/...` has another path but the same identity (dev + ino), so a path check misses it.
 * Only a file with more than one link can be such a link, so a normal file costs one stat. For those the identities of
 * the data folder's files are listed (a small folder, cached for a moment). pnpm/npm hard links in node_modules are not
 * refused: they are not in the data folder.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../session-store');
const { CONFIG_PATH } = require('../config');

const CACHE_MS = 2000;
const MAX_ENTRIES = 20000;
let cached = { at: 0, ids: new Set() };

const identity = stat => `${stat.dev}:${stat.ino}`;

/** dev:ino of every file under the data folder, and of config.json. */
function ownIdentities() {
  if (Date.now() - cached.at < CACHE_MS) return cached.ids;
  const ids = new Set();
  const add = file => { try { const stat = fs.statSync(file, { bigint: true }); if (stat.isFile() && stat.ino !== 0n) ids.add(identity(stat)); } catch { /* gone meanwhile */ } };
  add(CONFIG_PATH);
  const queue = [DATA_DIR];
  let seen = 0;
  while (queue.length && seen < MAX_ENTRIES) {
    let entries = [];
    try { entries = fs.readdirSync(queue.shift(), { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      seen += 1;
      const full = path.join(entry.parentPath || entry.path, entry.name);
      if (entry.isDirectory()) queue.push(full); else add(full);
    }
  }
  cached = { at: Date.now(), ids };
  return ids;
}

/** @param {string} real a real path @returns {boolean} the file is a hard link of a file of the GUI's data folder or its config */
function isOwnFile(real) {
  try {
    const stat = fs.statSync(real, { bigint: true });
    return stat.isFile() && stat.nlink > 1n && stat.ino !== 0n && ownIdentities().has(identity(stat));
  } catch { return false; }
}

module.exports = { isOwnFile };
