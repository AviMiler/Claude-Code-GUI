const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../lib/hooks/hooks-store');

const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-hooks-'));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'proj');
  fs.mkdirSync(home); fs.mkdirSync(cwd);
  return { config: { env: { CLAUDE_CONFIG_DIR: home } }, cwd, user: path.join(home, 'settings.json'), project: path.join(cwd, '.claude', 'settings.json'), local: path.join(cwd, '.claude', 'settings.local.json') };
};
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hook = extra => ({ scope: 'user', event: 'PreToolUse', matcher: 'Bash', command: 'echo hi', ...extra });

test('adding merges into an existing file and keeps every other key and hook', () => {
  const t = setup();
  fs.writeFileSync(t.user, JSON.stringify({ model: 'x', permissions: { allow: ['Bash'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'keep' }] }] } }));
  store.addHook(t.config, t.cwd, hook({ timeout: 30 }));
  const saved = readJson(t.user);
  assert.equal(saved.model, 'x');
  assert.deepEqual(saved.permissions, { allow: ['Bash'] });
  assert.equal(saved.hooks.Stop[0].hooks[0].command, 'keep');
  assert.deepEqual(saved.hooks.PreToolUse, [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi', timeout: 30 }] }]);
});

test('a same-matcher hook joins the group; an empty matcher writes no matcher key; each scope has its own file', () => {
  const t = setup();
  store.addHook(t.config, t.cwd, hook());
  store.addHook(t.config, t.cwd, hook({ command: 'second' }));
  assert.equal(readJson(t.user).hooks.PreToolUse[0].hooks.length, 2);
  store.addHook(t.config, t.cwd, hook({ scope: 'project', matcher: '', event: 'Stop' }));
  store.addHook(t.config, t.cwd, hook({ scope: 'local' }));
  assert.deepEqual(readJson(t.project).hooks.Stop, [{ hooks: [{ type: 'command', command: 'echo hi' }] }]);
  assert.ok(readJson(t.local).hooks.PreToolUse);
});

test('invalid JSON is refused and the file stays byte for byte', () => {
  const t = setup();
  fs.writeFileSync(t.user, '{ "a": ');
  assert.throws(() => store.addHook(t.config, t.cwd, hook()), error => error.status === 400 && /JSON/.test(error.message));
  assert.equal(fs.readFileSync(t.user, 'utf8'), '{ "a": ');
  assert.throws(() => store.deleteHook(t.config, t.cwd, { scope: 'user', event: 'Stop', groupIndex: 0, hookIndex: 0 }), error => error.status === 400);
  assert.equal(store.listHooks(t.config, t.cwd).files.find(file => file.scope === 'user').error.includes('JSON'), true);
});

test('validation: enums, command, timeout and matcher', () => {
  const bad = extra => assert.throws(() => store.validateHook(hook(extra)), error => error.status === 400);
  bad({ event: 'Nope' }); bad({ scope: 'global' }); bad({ command: '  ' }); bad({ command: 5 }); bad({ command: 'x'.repeat(8001) });
  bad({ timeout: 0 }); bad({ timeout: -3 }); bad({ timeout: 1.5 }); bad({ timeout: '30' }); bad({ timeout: 99999 });
  bad({ matcher: 'x'.repeat(201) }); bad({ matcher: 3 });
  assert.equal(store.validateHook(hook({ timeout: '' })).timeout, null);
  assert.equal(store.validateHook(hook({ matcher: undefined })).matcher, '');
});

test('delete removes only the chosen hook and cleans up empty arrays and objects', () => {
  const t = setup();
  fs.writeFileSync(t.user, JSON.stringify({ env: { A: '1' } }));
  store.addHook(t.config, t.cwd, hook());
  store.addHook(t.config, t.cwd, hook({ command: 'second' }));
  store.addHook(t.config, t.cwd, hook({ event: 'Stop', matcher: '' }));
  store.deleteHook(t.config, t.cwd, { scope: 'user', event: 'PreToolUse', groupIndex: 0, hookIndex: 0 });
  assert.deepEqual(readJson(t.user).hooks.PreToolUse[0].hooks.map(item => item.command), ['second']);
  store.deleteHook(t.config, t.cwd, { scope: 'user', event: 'PreToolUse', groupIndex: 0, hookIndex: 0 });
  assert.equal(readJson(t.user).hooks.PreToolUse, undefined);
  store.deleteHook(t.config, t.cwd, { scope: 'user', event: 'Stop', groupIndex: 0, hookIndex: 0 });
  assert.deepEqual(readJson(t.user), { env: { A: '1' } });
  assert.throws(() => store.deleteHook(t.config, t.cwd, { scope: 'user', event: 'Stop', groupIndex: 0, hookIndex: 0 }), error => error.status === 404);
});

test('update edits in place, or moves the hook when event or matcher change, keeping extra fields', () => {
  const t = setup();
  fs.writeFileSync(t.user, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'a', extra: 1 }, { type: 'command', command: 'b' }] }] } }));
  const from = { scope: 'user', event: 'PreToolUse', groupIndex: 0, hookIndex: 0 };
  store.updateHook(t.config, t.cwd, { ...hook({ command: 'a2', timeout: 5 }), from });
  assert.deepEqual(readJson(t.user).hooks.PreToolUse[0].hooks[0], { type: 'command', command: 'a2', extra: 1, timeout: 5 });
  store.updateHook(t.config, t.cwd, { ...hook({ command: 'a2', event: 'PostToolUse', matcher: 'Edit|Write' }), from });
  const saved = readJson(t.user).hooks;
  assert.deepEqual(saved.PreToolUse[0].hooks.map(item => item.command), ['b']);
  assert.equal(saved.PostToolUse[0].matcher, 'Edit|Write');
  assert.equal(saved.PostToolUse[0].hooks[0].extra, 1);
  assert.throws(() => store.updateHook(t.config, t.cwd, { ...hook({ scope: 'project' }), from }), error => error.status === 400);
});

test('the list shows scope, event, matcher and command of every file', () => {
  const t = setup();
  store.addHook(t.config, t.cwd, hook({ scope: 'local', timeout: 9 }));
  const { hooks, files } = store.listHooks(t.config, t.cwd);
  assert.equal(files.length, 3);
  assert.deepEqual(hooks, [{ scope: 'local', event: 'PreToolUse', matcher: 'Bash', type: 'command', command: 'echo hi', timeout: 9, groupIndex: 0, hookIndex: 0 }]);
});
