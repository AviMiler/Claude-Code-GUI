/**
 * Reads a CLI .jsonl file as parsed lines, reading only what was appended since the last read when the file only grew.
 * The lines of recently read files stay in memory, bounded by the files' total size (least recently read out first).
 */
const fs = require('fs');

const MAX_CACHED_BYTES = 32 * 1024 * 1024; // sum of the cached files' sizes; a bigger file is read whole every time
const CHECK_BYTES = 64; // the bytes before the cached end: unchanged = the file only grew (not rewritten or cut)
const NEWLINE = 0x0a;
const cache = new Map(); // file -> { end, lines, check }; Map order = least recently read first
let cachedBytes = 0;

/** @param {string} text @returns {object[]} the lines that parse as JSON (a half-written last line does not) */
function parseLines(text) {
  return text.split('\n').map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function readRange(handle, start, length) {
  const buffer = Buffer.alloc(Math.max(0, length));
  const read = length > 0 ? fs.readSync(handle, buffer, 0, length, start) : 0;
  return buffer.subarray(0, read);
}

function forget(file) {
  const entry = cache.get(file);
  if (entry) cachedBytes -= entry.end;
  cache.delete(file);
}

/** Keeps a file's complete lines (up to `end`, just after a newline) and the bytes that tell later whether it only grew. */
function remember(file, handle, end, lines) {
  forget(file);
  if (end > MAX_CACHED_BYTES) return;
  const checkStart = Math.max(0, end - CHECK_BYTES);
  cache.set(file, { end, lines, checkStart, check: readRange(handle, checkStart, end - checkStart) });
  cachedBytes += end;
  for (const [oldest] of cache) {
    if (cachedBytes <= MAX_CACHED_BYTES) break;
    forget(oldest);
  }
}

/**
 * The file's lines, oldest first. Callers must not change the line objects: they are shared with the next read.
 * @param {string} file @returns {object[]} a new array each call
 * @example readLines(transcriptPath).at(-1).uuid
 */
function readLines(file) {
  const handle = fs.openSync(file, 'r');
  try {
    const { size } = fs.fstatSync(handle);
    const entry = cache.get(file);
    const grew = entry && size >= entry.end
      && readRange(handle, entry.checkStart, entry.end - entry.checkStart).equals(entry.check);
    const start = grew ? entry.end : 0;
    const added = readRange(handle, start, size - start);
    const end = added.lastIndexOf(NEWLINE) + 1; // complete lines end here; the rest may still be being written
    const lines = (grew ? entry.lines : []).concat(parseLines(added.subarray(0, end).toString('utf8')));
    remember(file, handle, start + end, lines);
    return lines.concat(parseLines(added.subarray(end).toString('utf8'))); // a last line with no newline yet: shown, not kept
  } finally {
    fs.closeSync(handle);
  }
}

module.exports = { readLines, parseLines };
