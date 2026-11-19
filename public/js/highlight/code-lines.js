/** Splits highlighted HTML into one HTML string per line. Pure, so it can be unit tested without a browser. */

const TOKEN = /<span\b[^>]*>|<\/span>|\n/g;

/**
 * Splits highlight.js output into lines. A span that is open at a line break (a multi-line comment or string) is
 * closed at the end of that line and opened again at the start of the next, so every line is well-formed HTML.
 * Only `<span ...>` and `</span>` tags are expected (highlight.js escapes everything else).
 * @param {string} html highlighted HTML of the whole text
 * @returns {string[]} one entry per line ("a\n" gives ['a', ''])
 * @example splitHighlightedLines('<span class="c">/* a\nb *\/</span>') // ['<span class="c">/* a</span>', '<span class="c">b *\/</span>']
 */
export function splitHighlightedLines(html) {
  const lines = [];
  const open = []; // the opening tags in force, outermost first
  let line = '';
  let last = 0;
  for (const match of String(html).matchAll(TOKEN)) {
    line += html.slice(last, match.index);
    last = match.index + match[0].length;
    const token = match[0];
    if (token === '\n') {
      lines.push(line + '</span>'.repeat(open.length));
      line = open.join('');
    } else if (token === '</span>') {
      if (open.length) { open.pop(); line += token; } // a stray close is dropped so a line never closes what it did not open
    } else {
      open.push(token);
      line += token;
    }
  }
  line += html.slice(last);
  lines.push(line + '</span>'.repeat(open.length));
  return lines;
}
