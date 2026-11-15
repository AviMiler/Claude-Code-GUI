/**
 * A short fingerprint of one diff hunk as the Changes pane shows it (header and lines). The browser sends it with a
 * revert request and the server, which builds its own diff, compares it: a hunk that changed since it was drawn is not
 * reverted. Pure, no imports: the server loads this same file (lib/git/hunk-revert.js).
 */

/** cyrb53: a fast 53-bit string hash (not cryptographic; it only tells "the same hunk" from "changed since"). */
function cyrb53(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const SIGNS = { add: '+', del: '-', ctx: ' ' };

/**
 * @param {import('./diff-parse.js').DiffHunk} hunk a hunk from parseDiff
 * @returns {string} hex fingerprint
 * @example hunkHash(parseDiff(diff)[0].hunks[1]) // '1a2b3c4d5e6f7'
 */
export function hunkHash(hunk) {
  return cyrb53([hunk.header, ...hunk.lines.map(line => `${SIGNS[line.type]}${line.text}`)].join('\n'));
}
