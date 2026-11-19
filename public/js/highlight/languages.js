/** Which highlight.js language a file is in, from its name. Pure, so it can be unit tested without a browser. */

/** Extension (lowercase, without the dot) -> highlight.js language name. 'plaintext' means: do not colour. */
const BY_EXTENSION = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json', map: 'json',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', xaml: 'xml', csproj: 'xml', props: 'xml', config: 'xml', resx: 'xml',
  css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', markdown: 'markdown',
  py: 'python', pyw: 'python', rb: 'ruby', php: 'php', pl: 'perl', pm: 'perl', lua: 'lua', r: 'r',
  java: 'java', kt: 'kotlin', kts: 'kotlin', go: 'go', rs: 'rust', swift: 'swift',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', m: 'objectivec', mm: 'objectivec',
  cs: 'csharp', vb: 'vbnet',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
  bat: 'dos', cmd: 'dos',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'ini', editorconfig: 'ini',
  diff: 'diff', patch: 'diff', mk: 'makefile', wat: 'wasm',
  txt: 'plaintext', log: 'plaintext', csv: 'plaintext', tsv: 'plaintext',
};

/** Whole file names (lowercase) that have no telling extension. */
const BY_NAME = {
  dockerfile: 'dockerfile', containerfile: 'dockerfile', makefile: 'makefile', gnumakefile: 'makefile',
  '.gitignore': 'plaintext', '.gitattributes': 'plaintext', '.npmrc': 'ini', '.env': 'ini',
};

/**
 * The language of a file, from its path.
 * @param {string} path a file path with / or \ separators
 * @returns {string} a highlight.js language name, 'plaintext' for text that should stay plain, '' when unknown
 * @example languageForPath('C:\\x\\run.ps1') // 'powershell'
 * @example languageForPath('Dockerfile.dev') // 'dockerfile'
 */
export function languageForPath(path) {
  const name = String(path || '').split(/[\\/]/).pop().toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  if (/^(dockerfile|containerfile)([.-]|$)/.test(name) || name.endsWith('.dockerfile')) return 'dockerfile';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return BY_EXTENSION[name.slice(dot + 1)] || '';
}

/**
 * The language word of a Markdown fence's info string ("js title=x" -> "js"), lowercase.
 * @param {string} info @returns {string}
 */
export function fenceLanguage(info) {
  return String(info || '').trim().split(/\s+/)[0].replace(/^\{?\.?/, '').replace(/\}$/, '').toLowerCase();
}
