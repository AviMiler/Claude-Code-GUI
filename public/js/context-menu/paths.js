/** Path arithmetic in the browser, for paths from Windows (C:\repo, case-insensitive) or POSIX. */

const normal = path => String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
const caseless = path => /^[a-z]:\//i.test(path); // a Windows drive path compares without case

/**
 * @param {string} base a folder @param {string} target a file
 * @returns {string|null} target relative to base with forward slashes, '.' for the folder itself, null when outside
 * @example relativePath('C:\\repo', 'c:\\Repo\\src\\a.js') // 'src/a.js'
 */
export function relativePath(base, target) {
  const from = normal(base);
  const to = normal(target);
  const same = caseless(from) ? (a, b) => a.toLowerCase() === b.toLowerCase() : (a, b) => a === b;
  if (same(from, to)) return '.';
  const head = to.slice(0, from.length + 1);
  return from && same(head, `${from}/`) ? to.slice(from.length + 1) : null;
}

/** A repository-relative path made full (the Changes pane's files): joined with the separator the root uses. */
export function joinPath(root, relative) {
  if (!root) return relative;
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${separator}${relative.replace(/\//g, separator)}`;
}
