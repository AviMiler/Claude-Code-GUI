const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'launch-config-test-')));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
const { loadLaunch, MAX_LAUNCH_BYTES } = require('../lib/preview/launch-config');
const { devServerEnv, redactLine } = require('../lib/preview/dev-env');

const GUI_PORT = 3737;
let n = 0;
/** A fresh session folder with this launch.json content (an object is written as JSON). */
function folderWith(content) {
  const root = path.join(scratch, `p${++n}`);
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(root, 'web'), { recursive: true });
  if (content !== undefined) fs.writeFileSync(path.join(root, '.claude', 'launch.json'), typeof content === 'string' ? content : JSON.stringify(content));
  return root;
}
const load = content => loadLaunch({ cwd: folderWith(content) }, GUI_PORT);
const entry = extra => ({ version: '0.0.1', configurations: [{ name: 'web', runtimeExecutable: 'node', runtimeArgs: ['run', 'dev'], port: 5173, ...extra }] });

test('a valid file lists its configurations with the folder, url and a hash', () => {
  const result = load(entry({ cwd: 'web', env: { MODE: 'dev' } }));
  assert.equal(result.error, null);
  const [web] = result.configurations;
  assert.equal(web.executable, 'node');
  assert.ok(path.isAbsolute(web.program) && /node(.exe)?$/i.test(web.program), 'resolved to a full path');
  assert.deepEqual(web.args, ['run', 'dev']);
  assert.equal(path.basename(web.cwd), 'web');
  assert.equal(web.url, 'http://localhost:5173/');
  assert.match(web.hash, /^[0-9a-f]{64}$/);
});

test('no file is not an error; a missing session folder is', () => {
  assert.deepEqual(load(undefined), { file: loadLaunch({ cwd: path.join(scratch, `p${n}`) }, GUI_PORT).file, exists: false, error: null, configurations: [] });
  assert.ok(loadLaunch({ cwd: path.join(scratch, 'nope') }, GUI_PORT).error);
});

test('wrong types, extra fields and bad JSON refuse the whole file with a reason', () => {
  const bad = [
    '{not json', [], { configurations: [] }, { version: 1, configurations: [] }, { version: '1', configurations: {} },
    { version: '1', configurations: [], extra: 1 }, entry({ extra: true }), entry({ runtimeArgs: 'run dev' }), entry({ runtimeArgs: [1] }),
    entry({ port: '5173' }), entry({ port: 70000 }), entry({ runtimeExecutable: 'npm & calc' }), entry({ runtimeExecutable: '"npm"' }),
    entry({ runtimeArgs: ['%PATH%'] }), entry({ runtimeArgs: ['a\nb'] }), entry({ env: { 'A-B': 'x' } }), entry({ env: { A: 1 } }),
    entry({ url: 'http://example.com:5173' }), entry({ url: 'http://user:pw@localhost:5173' }), entry({ url: 'file:///etc/passwd' }),
    { version: '1', configurations: [entry().configurations[0], entry().configurations[0]] }, entry({ name: '' }),
    // bidi controls, C1 controls and line separators can make the dialog show something else than what runs
    entry({ name: 'web‮evil' }), entry({ runtimeArgs: ['a⁦b'] }), entry({ runtimeArgs: ['a\u0085b'] }), entry({ runtimeArgs: ['a b'] }),
    entry({ runtimeExecutable: 'no‏de' }), entry({ env: { A: 'x‪y' } }), entry({ env: { A: 'x y' } }),
    // network programs
    entry({ runtimeExecutable: '\\\\host\\share\\node.exe' }), entry({ runtimeExecutable: '//host/share/node' }),
    entry({ runtimeExecutable: 'no-such-program-xyz' }),
  ];
  for (const content of bad) {
    const result = load(content);
    assert.ok(result.error, `refused: ${JSON.stringify(content)}`);
    assert.deepEqual(result.configurations, []);
  }
});

test('cwd must stay inside the session folder', () => {
  for (const cwd of ['..', '../p1', path.join(scratch, 'p1'), 'C:\\Windows', 'missing']) assert.ok(load(entry({ cwd })).error, cwd);
  const root = folderWith(entry({ cwd: 'link' }));
  try { fs.symlinkSync(scratch, path.join(root, 'link'), 'junction'); } catch { return; }
  assert.match(loadLaunch({ cwd: root }, GUI_PORT).error, /יוצא/);
});

test('the GUI port is refused, by port or by url', () => {
  assert.match(load(entry({ port: GUI_PORT })).error, /הממשק/);
  assert.match(load(entry({ port: undefined, url: `http://127.0.0.1:${GUI_PORT}/` })).error, /הממשק/);
});

test('a symlinked launch.json or .claude folder and a huge file are not read', () => {
  const huge = load(`${' '.repeat(MAX_LAUNCH_BYTES + 1)}{}`);
  assert.match(huge.error, /גדול/);
  const outside = folderWith(entry()); // a valid file in another folder
  const other = path.join(scratch, `p${++n}`);
  fs.mkdirSync(other);
  fs.symlinkSync(path.join(outside, '.claude'), path.join(other, '.claude'), 'junction'); // junctions need no special right
  assert.match(loadLaunch({ cwd: other }, GUI_PORT).error, /קישור/);
  const root = folderWith(undefined);
  try { fs.symlinkSync(path.join(outside, '.claude', 'launch.json'), path.join(root, '.claude', 'launch.json'), 'file'); } catch (error) {
    if (error.code === 'EPERM') return; // a file symlink needs Developer Mode or admin on Windows
    throw error;
  }
  assert.match(loadLaunch({ cwd: root }, GUI_PORT).error, /קישור/);
});

test('the hash changes when the shown command changes', () => {
  const a = load(entry()).configurations[0].hash;
  const b = load(entry({ runtimeArgs: ['run', 'build'] })).configurations[0].hash;
  assert.notEqual(a, b);
});

test('the environment drops the GUI and model secrets but keeps the rest, and the configuration env wins', () => {
  const base = { PATH: '/bin', ANTHROPIC_AUTH_TOKEN: 'sk-secret-123456', CLAUDE_GUI_DATA: '/data', CLAUDE_GUI_VERIFY_SECRET: 'abcdefabcdef', CLAUDECODE: '1', HOME: '/h',
    GITHUB_TOKEN: 'ghp_abcdefghijkl', AWS_SECRET_ACCESS_KEY: 'aws-secret-value', NPM_CONFIG_AUTH: 'npm-auth-value' };
  const config = { env: { ANTHROPIC_BASE_URL: 'http://model:11434', HTTPS_PROXY: 'http://proxy', MY_API_KEY: 'k-123456789', LOG_LEVEL: 'x' } };
  const { env, secrets } = devServerEnv(config, { MODE: 'dev' }, base);
  const expected = ['HOME', 'HTTPS_PROXY', 'LOG_LEVEL', 'MODE', 'PATH', ...(process.platform === 'win32' ? ['NoDefaultCurrentDirectoryInExePath'] : [])];
  assert.deepEqual(Object.keys(env).sort(), expected.sort());
  if (process.platform === 'win32') assert.equal(env.NoDefaultCurrentDirectoryInExePath, '1');
  for (const value of ['sk-secret-123456', 'k-123456789', 'ghp_abcdefghijkl', 'aws-secret-value']) assert.ok(secrets.includes(value), value);
  assert.equal(redactLine('\x1b[31mtoken sk-secret-123456 at http://u:p@host/\x1b[0m', secrets), 'token *** at http://***@host/');
});
