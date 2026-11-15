// Unit tests for lib/cli-args.js: the argument list of one `claude -p` process, filtered by the detected capabilities.
// Uses a temp data folder (CLAUDE_GUI_DATA must be set BEFORE the modules are required: session-store registers an exit hook).
const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
process.env.CLAUDE_GUI_DATA = dataDir;
const { buildArgs } = require('../lib/cli-args');

const BASE = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
const MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
const caps = (flags = [], permissionModes = MODES) => ({ version: '2.1.308', flags, permissionModes, commands: [], error: null });
const UUID = '6f1c2a3e-9b7d-4c1e-8a2b-1234567890ab';

after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
// lib/session-store.js writes its file on exit; this runs after that hook (registered later) and removes the folder again.
process.on('exit', () => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('buildArgs: always-on arguments', () => {
  test('a bare session with no optional flags gets only the base arguments', () => {
    const args = buildArgs({ id: 's1', mode: 'plan', addDirs: [] }, { model: '' }, caps());
    assert.deepEqual(args, [...BASE, '--permission-prompt-tool', 'stdio', '--permission-mode', 'plan']);
  });

  test('the permission mode is converted to the name the installed CLI uses', () => {
    // 2.1.x renamed "default" to "manual": a CLI that only knows "manual" gets it.
    const args = buildArgs({ id: 's1', mode: 'default', addDirs: [] }, { model: '' }, caps([], ['manual', 'plan']));
    assert.deepEqual(args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 2), ['--permission-mode', 'manual']);
  });
});

describe('buildArgs: flags filtered by capabilities', () => {
  test('optional flags appear only when the CLI lists them', () => {
    const session = { id: 's1', mode: 'default', addDirs: [], effort: 'high', agent: 'reviewer' };
    const without = buildArgs(session, { model: '' }, caps());
    assert.ok(!without.includes('--include-partial-messages'));
    assert.ok(!without.includes('--replay-user-messages'));
    assert.ok(!without.includes('--effort'));
    assert.ok(!without.includes('--agent'));

    const withAll = buildArgs(session, { model: '' },
      caps(['--include-partial-messages', '--replay-user-messages', '--effort', '--agent']));
    assert.ok(withAll.includes('--include-partial-messages'));
    assert.ok(withAll.includes('--replay-user-messages'));
    assert.equal(withAll[withAll.indexOf('--effort') + 1], 'high');
    assert.equal(withAll[withAll.indexOf('--agent') + 1], 'reviewer');
  });

  test('the session model wins over the configured one; the configured one is the fallback', () => {
    const own = buildArgs({ id: 's1', mode: 'default', addDirs: [], model: 'session-model' }, { model: 'config-model' }, caps());
    assert.equal(own[own.indexOf('--model') + 1], 'session-model');
    const configured = buildArgs({ id: 's1', mode: 'default', addDirs: [] }, { model: 'config-model' }, caps());
    assert.equal(configured[configured.indexOf('--model') + 1], 'config-model');
  });

  test('the uploads folder is passed with --add-dir only when the CLI supports it', () => {
    const session = { id: 's1', mode: 'default', addDirs: [] };
    assert.ok(!buildArgs(session, { model: '' }, caps()).includes('--add-dir'));
    const args = buildArgs(session, { model: '' }, caps(['--add-dir']));
    const dir = args[args.indexOf('--add-dir') + 1];
    assert.ok(dir.startsWith(dataDir), 'uploads folder lives in the data folder');
    assert.ok(fs.existsSync(dir));
  });

  test('the session folders the user added are passed with --add-dir each', () => {
    const args = buildArgs({ id: 's1', mode: 'default', addDirs: ['C:\\one', 'C:\\two'] }, { model: '' }, caps());
    assert.deepEqual(args.filter((_, i) => args[i - 1] === '--add-dir'), ['C:\\one', 'C:\\two']);
  });
});

describe('buildArgs: resuming and forking', () => {
  const session = { id: 's1', mode: 'default', addDirs: [], claudeSessionId: 'conv-1' };

  test('--resume-session-at is passed only for a uuid', () => {
    const valid = buildArgs({ ...session, resumeAt: UUID }, { model: '' }, caps());
    assert.equal(valid[valid.indexOf('--resume-session-at') + 1], UUID);
    const invalid = buildArgs({ ...session, resumeAt: 'not-a-uuid; rm -rf' }, { model: '' }, caps());
    assert.ok(!invalid.includes('--resume-session-at'));
  });

  test('--fork-session is passed only for a pending fork and only when the CLI lists it', () => {
    const forking = { ...session, forkPending: true };
    assert.ok(!buildArgs(forking, { model: '' }, caps()).includes('--fork-session'));
    assert.ok(buildArgs(forking, { model: '' }, caps(['--fork-session'])).includes('--fork-session'));
    assert.ok(!buildArgs(session, { model: '' }, caps(['--fork-session'])).includes('--fork-session'));
  });

  test('--fallback-model is passed only when it differs from the main model', () => {
    const flags = caps(['--fallback-model']);
    const different = buildArgs({ ...session, model: 'main', fallbackModel: 'other' }, { model: '' }, flags);
    assert.equal(different[different.indexOf('--fallback-model') + 1], 'other');
    const same = buildArgs({ ...session, model: 'main', fallbackModel: 'main' }, { model: '' }, flags);
    assert.ok(!same.includes('--fallback-model'));
  });
});

describe('buildArgs: settings file', () => {
  test('an output style is written to a settings file that the flag points to', () => {
    const args = buildArgs({ id: 'style-session', mode: 'default', addDirs: [], outputStyle: 'Explanatory' }, { model: '' }, caps());
    const file = args[args.indexOf('--settings') + 1];
    assert.ok(file.startsWith(dataDir));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { outputStyle: 'Explanatory' });
  });

  test('no settings flag when the session has no extra settings', () => {
    assert.ok(!buildArgs({ id: 'plain', mode: 'default', addDirs: [] }, { model: '' }, caps()).includes('--settings'));
  });
});
