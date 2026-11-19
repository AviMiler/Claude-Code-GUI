/** Hostile launch.json cases of the security review: a planted program, argument splitting through cmd.exe, a hard link. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

const scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-hostile-test-')));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
fs.mkdirSync(process.env.CLAUDE_GUI_DATA, { recursive: true });
const store = require('../lib/session-store');
const { loadLaunch } = require('../lib/preview/launch-config');
const { resolveProgram } = require('../lib/preview/dev-resolve');
const { startDevServer, listDevServers, stopSessionDevServers, spawnSpec } = require('../lib/preview/dev-servers');
const { portAnswers } = require('../lib/preview/dev-port');

const WIN = process.platform === 'win32';
const GUI_PORT = 3999;
const nodeDir = path.dirname(process.execPath);
const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const until = async (check, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await check()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };

let n = 0;
function project(configurations) {
  const root = path.join(scratch, `p${++n}`);
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'launch.json'), JSON.stringify({ version: '0.0.1', configurations }));
  return root;
}
/** Runs fn with process.env.PATH set to `dirs` (the GUI's own PATH), restoring it after. */
function withPath(dirs, fn) {
  const key = Object.keys(process.env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  const old = process.env[key];
  process.env[key] = dirs.join(path.delimiter);
  try { return fn(); } finally { process.env[key] = old; }
}

test.after(() => { for (const s of store.list()) stopSessionDevServers(s.id, true); });

test('a node.cmd / node planted in the project never stands in for node', { skip: !WIN && 'Windows search order' }, () => {
  const root = project([{ name: 'web', runtimeExecutable: 'node', runtimeArgs: ['-v'], env: { PATH: '.' } }]);
  const marker = path.join(scratch, 'planted-ran.txt');
  fs.writeFileSync(path.join(root, 'node.cmd'), `@echo pwned> "${marker}"\r\n`);
  // even with the project folder and "." first in the GUI's PATH, and env.PATH in the file pointing at "."
  const result = withPath([root, '.', 'relative\\bin', nodeDir], () => loadLaunch({ cwd: root }, GUI_PORT));
  assert.equal(result.error, null);
  const { program } = result.configurations[0];
  assert.equal(program.toLowerCase(), fs.realpathSync.native(process.execPath).toLowerCase());
  assert.equal(resolveProgram('node', { root, cwd: root }, { PATH: root, PATHEXT: '.CMD;.EXE' }).error !== undefined, true, 'only the project in PATH: not found');
});

test('the planted node.cmd does not run when the server starts, even through an npm-style .cmd', { skip: !WIN && 'Windows only' }, async () => {
  const port = await freePort();
  const bin = path.join(scratch, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  // a shim like npm.cmd: calls plain `node`, which cmd.exe would look up in the current (project) folder first
  fs.writeFileSync(path.join(bin, 'shim.cmd'), '@node %*\r\n');
  const script = `require('http').createServer((q,s)=>s.end('ok')).listen(${port},'127.0.0.1')`;
  const root = project([{ name: 'web', runtimeExecutable: 'shim', runtimeArgs: ['-e', script], port }]);
  const marker = path.join(scratch, 'planted-shim-ran.txt');
  fs.writeFileSync(path.join(root, 'node.cmd'), `@echo pwned> "${marker}"\r\n`);
  const session = store.create({ name: 's', cwd: root, mode: 'default' });
  const entry = withPath([bin, nodeDir, path.dirname(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe')], () => loadLaunch(session, GUI_PORT)).configurations[0];
  assert.equal(entry.program.toLowerCase(), path.join(bin, 'shim.cmd').toLowerCase());
  await withPath([bin, nodeDir, path.dirname(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe')], () => startDevServer(session.id, entry, { env: {} }));
  assert.ok(await until(() => portAnswers(port)), 'the real node ran');
  assert.equal(fs.existsSync(marker), false, 'the planted node.cmd did not run');
  stopSessionDevServers(session.id, true);
  assert.ok(await until(async () => !(await portAnswers(port))));
});

test('a " in an argument is refused for a .cmd program; a trailing backslash cannot escape its quote', { skip: !WIN && 'cmd.exe only' }, async () => {
  const bin = path.join(scratch, 'argbin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'args.cmd'), `@"${process.execPath}" -e "console.log('ARGS'+JSON.stringify(process.argv.slice(1)))" %*\r\n`);
  const hostile = project([{ name: 'x', runtimeExecutable: 'args', runtimeArgs: ['x\\" --inspect=0.0.0.0:9229 y'] }]);
  const refused = withPath([bin], () => loadLaunch({ cwd: hostile }, GUI_PORT));
  assert.match(refused.error, /"/);
  assert.throws(() => spawnSpec(path.join(bin, 'args.cmd'), ['a"b']));
  const root = project([{ name: 'x', runtimeExecutable: 'args', runtimeArgs: ['a b\\', '--inspect=0.0.0.0:9229 c', 'd & echo pwned'] }]);
  const session = store.create({ name: 's', cwd: root, mode: 'default' });
  const entry = withPath([bin], () => loadLaunch(session, GUI_PORT)).configurations[0];
  await startDevServer(session.id, entry, { env: {} });
  let line = null;
  await until(() => { line = listDevServers(session.id)[0].log.map(l => l.text).find(t => t.startsWith('ARGS')); return Boolean(line); });
  assert.deepEqual(JSON.parse(line.slice(4)), ['a b\\', '--inspect=0.0.0.0:9229 c', 'd & echo pwned'], 'each argument arrived whole');
  stopSessionDevServers(session.id, true);
});

test('a launch.json that is a hard link of the GUI config is not read', () => {
  fs.writeFileSync(process.env.CLAUDE_GUI_CONFIG, JSON.stringify({ version: '0.0.1', configurations: [] }));
  const root = path.join(scratch, `p${++n}`);
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.linkSync(process.env.CLAUDE_GUI_CONFIG, path.join(root, '.claude', 'launch.json'));
  assert.match(loadLaunch({ cwd: root }, GUI_PORT).error, /קישור קשיח/);
});

test('network PATH entries and network programs are never used', () => {
  const root = project([]);
  assert.ok(resolveProgram('node', { root, cwd: root }, { PATH: '\\\\host\\share', PATHEXT: '.EXE' }).error);
  assert.ok(resolveProgram('\\\\host\\share\\node.exe', { root, cwd: root }).error);
  assert.ok(resolveProgram('//host/share/node', { root, cwd: root }).error);
});

test('a % in the folder of a .cmd program is refused (cmd.exe would expand it), and zero-width characters too', { skip: !WIN }, () => {
  const root = path.join(scratch, `p${++n}`);
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(root, 'a%X%b'));
  fs.writeFileSync(path.join(root, 'a%X%b', 'run.cmd'), '@echo off\r\n');
  fs.writeFileSync(path.join(root, '.claude', 'launch.json'), JSON.stringify({ version: '0.0.1', configurations: [{ name: 'x', runtimeExecutable: './run.cmd', cwd: 'a%X%b', port: 4999, env: { X: '" & echo INJECTED & rem "' } }] }));
  const result = loadLaunch({ cwd: root }, GUI_PORT);
  assert.ok(result.error, 'refused'); assert.match(result.error, /%/);
  assert.throws(() => spawnSpec(path.join(root, 'a%X%b', 'run.cmd'), []), /%/);
  const zero = project([{ name: 'z', runtimeExecutable: process.execPath, runtimeArgs: ['serv\u200Ber.js'], port: 4998 }]);
  assert.ok(loadLaunch({ cwd: zero }, GUI_PORT).error);
});
