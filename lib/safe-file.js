/**
 * Crash-safe JSON file persistence: write a temp file then rename it over the target (keeping a `.bak` of the previous
 * good file), and read with a fallback to the backup. A file that fails to parse is moved aside, never overwritten.
 * Every function takes the `fs` module as an option so tests can inject failures.
 */
const realFs = require('fs');

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']); // Windows: antivirus / indexer holds the target for a moment
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Writes `text` to `file` atomically (temp + rename). The previous file becomes `file.bak`.
 * A rename that keeps failing with a lock error is retried, then the text is written in place.
 * @param {string} file @param {string} text
 * @param {{fs?:object, retries?:number, sleep?:(ms:number)=>void}} [options]
 * @returns {'rename'|'in-place'} how it was written
 */
function writeFileSafe(file, text, { fs = realFs, retries = 5, sleep = sleepSync } = {}) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, text);
  try { fs.copyFileSync(file, `${file}.bak`); } catch (error) { if (error.code !== 'ENOENT') console.error('[safe-file] cannot keep a backup:', error.message); }
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { fs.renameSync(temp, file); return 'rename'; } catch (error) {
      if (!RETRY_CODES.has(error.code)) break;
      sleep(20 * (attempt + 1));
    }
  }
  fs.writeFileSync(file, text);
  try { fs.unlinkSync(temp); } catch { /* the temp file may already be gone */ }
  return 'in-place';
}

/**
 * Reads and parses `file`. When it is unreadable or does not parse, it is kept as `file.corrupt-<timestamp>` and
 * `file.bak` is tried instead.
 * @param {string} file @param {(text:string)=>any} parse throws on bad content
 * @param {{fs?:object, now?:()=>number, warn?:(message:string)=>void}} [options]
 * @returns {{value:any, source:'main'|'backup'|'missing'|'none', corruptPath:string|null}} 'none': both failed (value null)
 */
function readFileSafe(file, parse, { fs = realFs, now = Date.now, warn = console.error } = {}) {
  const attempt = path => {
    try { return { value: parse(fs.readFileSync(path, 'utf8')) }; } catch (error) { return { error }; }
  };
  const main = attempt(file);
  if (!('error' in main)) return { value: main.value, source: 'main', corruptPath: null };
  if (main.error.code === 'ENOENT') return { value: null, source: 'missing', corruptPath: null };
  let corruptPath = `${file}.corrupt-${now()}`;
  try { fs.renameSync(file, corruptPath); } catch { try { fs.copyFileSync(file, corruptPath); } catch { corruptPath = null; } }
  warn(`[safe-file] !!! ${file} cannot be read (${main.error.message}); ${corruptPath ? `kept as ${corruptPath}` : 'COULD NOT BE KEPT'}`);
  const backup = attempt(`${file}.bak`);
  if (!('error' in backup)) { warn(`[safe-file] !!! restored from ${file}.bak`); return { value: backup.value, source: 'backup', corruptPath }; }
  warn('[safe-file] !!! no usable backup either: starting empty');
  return { value: null, source: 'none', corruptPath };
}

module.exports = { writeFileSafe, readFileSafe };
