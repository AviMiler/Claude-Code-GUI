const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

const scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-servers-test-')));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
const store = require('../lib/session-store');
const service = require('../lib/session-service');
const { DEV_SERVER_ROUTES } = require('../lib/preview/dev-server-routes');
const { stopSessionDevServers } = require('../lib/preview/dev-servers');
const { portAnswers } = require('../lib/preview/dev-port');

const GUI_PORT = 3999;
const config = { port: GUI_PORT, env: { ANTHROPIC_AUTH_TOKEN: 'sk-test-abcdefgh', CLAUDE_CODE_X: '1' } };
// The dev server: a tiny http server on PORT_X that prints which GUI / model variables it can see.
const SCRIPT = "const p=+process.env.PORT_X;require('http').createServer((q,s)=>s.end('ok')).listen(p,'127.0.0.1',()=>console.log('listening '+p+' '+JSON.stringify(Object.keys(process.env).filter(k=>/^(ANTHROPIC|CLAUDE)/i.test(k)))))";

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (check, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await check()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };

function sessionWith(configurations) {
  const cwd = fs.mkdtempSync(path.join(scratch, 'p-'));
  fs.mkdirSync(path.join(cwd, '.claude'));
  fs.writeFileSync(path.join(cwd, '.claude', 'launch.json'), JSON.stringify({ version: '0.0.1', configurations }));
  return store.create({ name: 's', cwd, mode: 'default' });
}
const server = (name, port, executable = process.execPath) => ({ name, runtimeExecutable: executable, runtimeArgs: ['-e', SCRIPT], port, env: { PORT_X: String(port) } });

async function call(method, suffix, session, body = {}) {
  const url = `/api/sessions/${session.id}/dev-servers${suffix}`;
  const found = DEV_SERVER_ROUTES.find(r => r.method === method && r.pattern.test(url));
  const result = await found.handler({ config, params: url.match(found.pattern).slice(1), body: async () => body });
  return Array.isArray(result) ? result[1] : result;
}
const list = session => call('GET', '', session);
const start = (session, body) => call('POST', '/start', session, body);
const stateOf = async (session, name) => (await list(session)).servers.find(s => s.name === name);

test.after(() => { for (const s of store.list()) stopSessionDevServers(s.id, true); });

test('a start takes the command from the file by name, with the shown hash only', async () => {
  const port = await freePort();
  const session = sessionWith([server('web', port)]);
  const { configurations } = await list(session);
  assert.deepEqual(configurations[0].env, { PORT_X: String(port) }, 'the dialog gets the variables with their values');
  assert.ok(path.isAbsolute(configurations[0].program), 'and the full path that runs');
  await assert.rejects(start(session, { name: 'web' }), { status: 400 });
  await assert.rejects(start(session, { name: 'other', hash: configurations[0].hash }), { status: 404 });
  // anything else in the body (a command, a folder) is ignored
  await start(session, { name: 'web', hash: configurations[0].hash, runtimeExecutable: 'calc', cwd: 'C:\\' });
  assert.ok(await until(async () => (await stateOf(session, 'web')).ready), 'the port answers');
  const state = await stateOf(session, 'web');
  assert.equal(state.url, `http://localhost:${port}/`);
  const line = state.log.map(l => l.text).find(text => text.startsWith('listening'));
  assert.equal(line, `listening ${port} []`, 'no ANTHROPIC_* / CLAUDE_* variable reached the dev server');
  await assert.rejects(start(session, { name: 'web', hash: configurations[0].hash }), { status: 409 }); // one per configuration
  // stop kills the process tree and frees the port
  const pid = state.pid;
  assert.deepEqual(await call('POST', '/stop', session, { name: 'web' }), { stopped: true });
  assert.ok(await until(async () => !(await portAnswers(port)) && !alive(pid)), 'the port is free and the process gone');
  assert.ok(await until(async () => (await stateOf(session, 'web')).status === 'stopped'));
});

test('a file changed after it was shown is refused', async () => {
  const port = await freePort();
  const session = sessionWith([server('web', port)]);
  const { configurations } = await list(session);
  fs.writeFileSync(path.join(session.cwd, '.claude', 'launch.json'), JSON.stringify({ version: '0.0.1', configurations: [{ ...server('web', port), runtimeArgs: ['-e', 'console.log(1)'] }] }));
  await assert.rejects(start(session, { name: 'web', hash: configurations[0].hash }), { status: 409, message: /השתנה/ });
  assert.equal(await stateOf(session, 'web'), undefined, 'nothing started');
});

test('the GUI port is refused and a port in use gives a clear error', async () => {
  const gui = sessionWith([server('gui', GUI_PORT)]);
  const listed = await list(gui);
  assert.match(listed.error, /הממשק/);
  await assert.rejects(start(gui, { name: 'gui', hash: 'a'.repeat(64) }), { status: 409 });
  const port = await freePort();
  const taken = net.createServer().listen(port, '127.0.0.1');
  await new Promise(resolve => taken.once('listening', resolve));
  try {
    const session = sessionWith([server('web', port)]);
    const { configurations } = await list(session);
    await assert.rejects(start(session, { name: 'web', hash: configurations[0].hash }), { status: 409, message: /תפוס/ });
  } finally { taken.close(); }
});

test('deleting the session kills its dev server', async () => {
  const port = await freePort();
  const session = sessionWith([server('web', port)]);
  const { configurations } = await list(session);
  await start(session, { name: 'web', hash: configurations[0].hash });
  assert.ok(await until(async () => (await stateOf(session, 'web'))?.ready));
  const { pid } = await stateOf(session, 'web');
  await service.deleteSession(session.id);
  assert.ok(await until(async () => !(await portAnswers(port)) && !alive(pid)), 'killed with the session');
});

test('a Windows shim name (no .exe) runs through cmd.exe and is killed with its tree', { skip: process.platform !== 'win32' }, async () => {
  const port = await freePort();
  const session = sessionWith([server('shim', port, 'node')]);
  const { configurations } = await list(session);
  await start(session, { name: 'shim', hash: configurations[0].hash });
  assert.ok(await until(async () => (await stateOf(session, 'shim'))?.ready), 'node started through cmd.exe');
  await call('POST', '/stop', session, { name: 'shim' });
  assert.ok(await until(async () => !(await portAnswers(port))), 'the node child of cmd.exe died too');
});
