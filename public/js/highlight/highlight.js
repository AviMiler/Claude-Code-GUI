/**
 * Syntax highlighting through the vendored highlight.js (public/vendor/highlight/, loaded by a classic script in
 * index.html as the global `hljs`). Only highlight.js's own output is ever returned as HTML: it escapes the text and
 * adds `<span class="hljs-...">` tags. Without `hljs`, above the size caps or on any error the caller shows plain text.
 */
import { splitHighlightedLines } from './code-lines.js';

const MAX_CHARS = 200 * 1024; // larger text stays plain (a 2 MB file would freeze the page)
const AUTO_MAX_CHARS = 20 * 1024; // guessing the language runs every grammar: only for small text
const CACHE_MAX_CHARS = 50 * 1024;
const CACHE_SIZE = 64;
let large = { key: null, html: null };
const cache = new Map(); // `${language}\0${text}` -> html|null; streaming re-renders the same closed blocks every frame

/** The highlight.js global, or null when the vendor file did not load. */
const engine = () => (typeof globalThis.hljs?.highlight === 'function' ? globalThis.hljs : null);

function compute(text, language) {
  const hljs = engine();
  if (!hljs || !text || text.length > MAX_CHARS || language === 'plaintext') return null;
  try {
    if (language) return hljs.getLanguage(language) ? hljs.highlight(text, { language, ignoreIllegals: true }).value : null; // "console", "output": never guessed
    if (text.length > AUTO_MAX_CHARS) return null;
    return hljs.highlightAuto(text).value;
  } catch {
    return null; // a grammar error never breaks the page: plain text
  }
}

/**
 * Highlighted HTML for a piece of code.
 * @param {string} text the raw code
 * @param {string} [language] a highlight.js language name or alias (an unknown one stays plain); '' guesses (small text only)
 * @returns {string|null} safe HTML from highlight.js, or null: show `text` as plain text
 */
export function highlightHtml(text, language = '') {
  const source = String(text ?? '');
  const key = `${language}\u0000${source}`;
  if (source.length > CACHE_MAX_CHARS) { // one slot, so a streaming message does not redo a large block every frame
    if (large.key !== key && engine()) large = { key, html: compute(source, language) };
    return large.key === key ? large.html : compute(source, language);
  }
  if (cache.has(key)) {
    const html = cache.get(key);
    cache.delete(key); // move to the newest end
    cache.set(key, html);
    return html;
  }
  const html = compute(source, language);
  if (engine()) { // do not remember "plain" from before the script loaded
    cache.set(key, html);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  }
  return html;
}

/**
 * Highlighted HTML per line, for line-numbered views.
 * @param {string[]} lines the text's lines (without their newlines)
 * @param {string} [language] as for highlightHtml
 * @returns {string[]|null} one safe HTML string per line, or null: show the lines as plain text
 */
export function highlightLines(lines, language = '') {
  const html = highlightHtml(lines.join('\n'), language);
  if (html === null) return null;
  const split = splitHighlightedLines(html);
  return split.length === lines.length ? split : null; // a mismatch would put colours on the wrong line numbers
}
