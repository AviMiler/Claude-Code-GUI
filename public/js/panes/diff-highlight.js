/**
 * Syntax colours for the Changes pane's diffs. A hunk is two texts, not one: the new side (context and added lines) and
 * the old side (deleted lines), each highlighted as a whole so multi-line strings and comments colour right, then the
 * per-line HTML goes back to the rows. Only highlight.js's escaped output is returned; the row's text stays the same.
 */
import { highlightLines } from '../highlight/highlight.js';
import { languageForPath } from '../highlight/languages.js';
import { hunkHash } from './hunk-hash.js';

const CACHE_SIZE = 200;
const cache = new Map(); // `${language}|${hunk hash}` -> html|null per line

/**
 * The two texts of a hunk.
 * @param {import('./diff-parse.js').DiffHunk} hunk
 * @returns {{next:{lines:string[], at:number[]}, prev:{lines:string[], at:number[]}}} lines and each line's index in hunk.lines
 */
export function sideTexts(hunk) {
  const next = { lines: [], at: [] };
  const prev = { lines: [], at: [] };
  hunk.lines.forEach((line, index) => {
    const side = line.type === 'del' ? prev : next;
    side.lines.push(line.text);
    side.at.push(index);
  });
  return { next, prev };
}

/**
 * @param {number} count the hunk's line count
 * @param {{at:number[]}} next @param {{at:number[]}} prev the sides of sideTexts
 * @param {string[]|null} nextHtml @param {string[]|null} prevHtml highlightLines results (null: that side stays plain)
 * @returns {(string|null)[]} the HTML for each line of the hunk, null where the line stays plain
 */
export function mapToRows(count, next, prev, nextHtml, prevHtml) {
  const rows = new Array(count).fill(null);
  if (nextHtml) next.at.forEach((index, i) => { rows[index] = nextHtml[i]; });
  if (prevHtml) prev.at.forEach((index, i) => { rows[index] = prevHtml[i]; });
  return rows;
}

/**
 * Highlighted HTML for each line of a hunk (lazy: call it only for an expanded file).
 * @param {import('./diff-parse.js').DiffHunk} hunk @param {string} path the file's path (picks the language)
 * @returns {(string|null)[]} one entry per hunk line; null = show the line as plain text
 */
export function highlightHunk(hunk, path) {
  const language = languageForPath(path);
  if (!language) return hunk.lines.map(() => null); // an unknown type is never guessed from a fragment
  const key = `${language}|${hunkHash(hunk)}`;
  if (cache.has(key)) return cache.get(key);
  const { next, prev } = sideTexts(hunk);
  const rows = mapToRows(hunk.lines.length, next, prev, highlightLines(next.lines, language), highlightLines(prev.lines, language));
  if (globalThis.hljs) { // do not remember "plain" from before the script loaded
    cache.set(key, rows);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  }
  return rows;
}

/**
 * Appends a line's code to a cell: highlight.js's HTML when there is some, else the text.
 * @param {HTMLElement} cell @param {string} text @param {string|null} html
 */
export function setCode(cell, text, html) {
  if (html === null || html === undefined) cell.append(text);
  else cell.insertAdjacentHTML('beforeend', html);
}
