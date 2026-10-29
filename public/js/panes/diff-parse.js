/** Parses `git diff` output (unified format) into files, hunks and numbered lines for the Changes pane. */

/**
 * @typedef {{type:'add'|'del'|'ctx', text:string, oldLine:number|null, newLine:number|null}} DiffLine
 * @typedef {{header:string, lines:DiffLine[]}} DiffHunk header: the whole "@@ -a,b +c,d @@ context" line
 * @typedef {{path:string, oldPath:string|null, status:'modified'|'added'|'deleted'|'renamed', binary:boolean,
 *   added:number, removed:number, hunks:DiffHunk[]}} DiffFile
 */

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;
// Git C-quotes names with quotes, backslashes or control characters: "we\"ird.txt".
const UNESCAPE = { '"': '"', '\\': '\\', t: '\t', n: '\n' };
const unquote = path => (/^".*"$/.test(path) ? path.slice(1, -1).replace(/\\(["\\tn])/g, (all, char) => UNESCAPE[char]) : path);
// Git ends a ---/+++ path that has spaces with a tab.
const stripPrefix = path => unquote(path.replace(/\t$/, '')).replace(/^[ab]\//, '');

/** "diff --git a/x b/y": paths may hold spaces, so split at the last " b/" (the ---/+++ lines confirm it later). */
function headerPaths(line) {
  const rest = line.slice('diff --git '.length);
  const at = rest.lastIndexOf(' b/') >= 0 ? rest.lastIndexOf(' b/') : rest.lastIndexOf(' "b/');
  return at < 0 ? [rest, rest] : [rest.slice(0, at), rest.slice(at + 1)];
}

/**
 * @param {string} text output of `git diff` (may hold several diffs one after another, e.g. staged then unstaged)
 * @returns {DiffFile[]} files in the order they appear; the same path twice (staged and unstaged) stays two entries
 * @example parseDiff(diff)[0] // { path: 'src/app.js', status: 'modified', added: 3, removed: 1, hunks: [...] }
 */
export function parseDiff(text) {
  const files = [];
  let file = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\r$/, ''); // files with CRLF line ends
    if (line.startsWith('diff --git ')) {
      const [a, b] = headerPaths(line);
      file = { path: stripPrefix(b), oldPath: null, status: 'modified', binary: false, added: 0, removed: 0, hunks: [] };
      if (stripPrefix(a) !== file.path) file.oldPath = stripPrefix(a);
      files.push(file);
      hunk = null;
    } else if (!file) {
      continue;
    } else if (line.startsWith('new file mode')) {
      file.status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      file.status = 'deleted';
    } else if (line.startsWith('rename from ')) {
      file.status = 'renamed';
      file.oldPath = line.slice('rename from '.length);
    } else if (!hunk && line.startsWith('+++ ') && line !== '+++ /dev/null') {
      file.path = stripPrefix(line.slice(4));
    } else if (line.startsWith('Binary files ')) {
      file.binary = true;
    } else if (HUNK_HEADER.test(line)) {
      const [, oldStart, newStart] = line.match(HUNK_HEADER);
      oldLine = Number(oldStart);
      newLine = Number(newStart);
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
    // Inside a hunk every +/- line is content, even "++i" or "-- comment": the ---/+++ headers only come before hunks.
    } else if (hunk && line.startsWith('+')) {
      hunk.lines.push({ type: 'add', text: line.slice(1), oldLine: null, newLine: newLine++ });
      file.added += 1;
    } else if (hunk && line.startsWith('-')) {
      hunk.lines.push({ type: 'del', text: line.slice(1), oldLine: oldLine++, newLine: null });
      file.removed += 1;
    } else if (hunk && line.startsWith(' ')) {
      hunk.lines.push({ type: 'ctx', text: line.slice(1), oldLine: oldLine++, newLine: newLine++ });
    }
  }
  return files;
}
