/**
 * The Changes pane's diff cut into files, read with the pane's own parser (public/js/panes/diff-parse.js), so the
 * server sees each file exactly as the pane shows it. Used by the one-hunk revert and the whole-file discard.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PANES = path.join(__dirname, '..', '..', 'public', 'js', 'panes');

/** The pane's ES modules (no imports of their own), loaded as data: URLs: always ESM, whatever Node guesses for a .js file. */
const loadEsm = file => import(`data:text/javascript;base64,${fs.readFileSync(path.join(PANES, file)).toString('base64')}`);
let modules = null;

/** @returns {Promise<{parseDiff:Function, hunkHash:Function}>} the pane's parser and hunk fingerprint */
const paneCode = () => (modules ??= Promise.all([loadEsm('diff-parse.js'), loadEsm('hunk-hash.js')])
  .then(([{ parseDiff }, { hunkHash }]) => ({ parseDiff, hunkHash })));

/**
 * @param {string} diff the raw diff @returns {string[][]} one list of lines per file (CR bytes kept: a CRLF file's patch must keep them)
 */
function fileSections(diff) {
  const sections = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) sections.push([]);
    sections.at(-1)?.push(line);
  }
  return sections;
}

/**
 * A fingerprint of each file's part of the diff, keyed by the path the pane shows (sha1 of the section's text). A path
 * that appears in two sections gets null: the pane cannot say which one the user saw.
 * @param {string} diff the same diff text the pane gets
 * @returns {Promise<Map<string, string|null>>}
 * @example (await fileHashes(diff)).get('src/app.js') // '3f786850e387550fdab836ed7e6dc881de23001b'
 */
async function fileHashes(diff) {
  const { parseDiff } = await paneCode();
  const hashes = new Map();
  for (const lines of fileSections(diff)) {
    const text = lines.join('\n');
    const file = parseDiff(text)[0];
    if (!file) continue;
    hashes.set(file.path, hashes.has(file.path) ? null : crypto.createHash('sha1').update(text, 'utf8').digest('hex'));
  }
  return hashes;
}

module.exports = { paneCode, fileSections, fileHashes };
