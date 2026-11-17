const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-tabs-test-')));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
const store = require('../lib/session-store');
const { createTerminal, listTerminals, removeTerminal, MAX_TERMINALS } = require('../lib/terminal/terminals');
const { TERMINAL_TAB_ROUTES } = require('../lib/terminal/terminal-tabs-routes');

const project = path.join(scratch, 'project');
fs.mkdirSync(path.join(project, 'sub'), { recursive: true });
fs.writeFileSync(path.join(project, 'sub', 'a.txt'), 'x');
const session = store.create({ name: 's', cwd: project, mode: 'default' });
const call = (method, suffix, body = {}) => {
  const url = `/api/sessions/${session.id}/terminals${suffix}`;
  const found = TERMINAL_TAB_ROUTES.find(r => r.method === method && r.pattern.test(url));
  return found.handler({ params: url.match(found.pattern).slice(1), body: async () => body });
};

test('terminals get increasing numbers that are not reused after a close', () => {
  const first = createTerminal(session.id, project);
  const second = createTerminal(session.id, project);
  assert.deepEqual([first.n, second.n], [1, 2]);
  removeTerminal(session.id, first.id);
  assert.equal(createTerminal(session.id, project).n, 3);
  listTerminals(session.id).forEach(t => removeTerminal(session.id, t.id));
});

test('route: open without a folder uses the session folder, with a folder resolves it inside the session', async () => {
  const [status, { terminal }] = await call('POST', '');
  assert.equal(status, 201);
  assert.equal(terminal.cwd.toLowerCase(), project.toLowerCase());
  const [, sub] = await call('POST', '', { folder: 'sub/a.txt' }); // a file: its folder
  assert.equal(sub.terminal.cwd.toLowerCase(), path.join(project, 'sub').toLowerCase());
  const listed = await call('GET', '');
  assert.equal(listed.terminals.length, 2);
  assert.equal(listed.max, MAX_TERMINALS);
});

test('route: a folder outside the session, a missing one or a wrong type is refused', async () => {
  await assert.rejects(call('POST', '', { folder: '..' }), { status: 403 });
  await assert.rejects(call('POST', '', { folder: scratch }), { status: 403 });
  await assert.rejects(call('POST', '', { folder: 'nope' }), { status: 404 });
  await assert.rejects(call('POST', '', { folder: 7 }), { status: 400 });
});

test('route: close removes the terminal, closing twice reports it, and the limit holds', async () => {
  const [{ id }] = (await call('GET', '')).terminals;
  assert.deepEqual(await call('POST', `/${id}/close`), { closed: true });
  assert.deepEqual(await call('POST', `/${id}/close`), { closed: false });
  while (listTerminals(session.id).length < MAX_TERMINALS) await call('POST', '');
  await assert.rejects(call('POST', ''), { status: 409 });
});
