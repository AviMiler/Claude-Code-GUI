// Unit tests for the pure parts of lib/cli-capabilities.js (no `claude` process is started).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHelp, cliPermissionMode, hasFlag } = require('../lib/cli-capabilities');

const HELP = [
  'Usage: claude [options] [command] [prompt]',
  '',
  'Options:',
  '  --model <model>                  Model for the session',
  '  --include-partial-messages       Stream partial messages',
  '  --permission-mode <mode>         Permission mode (choices: "default", "acceptEdits", "plan")',
  '',
  'Commands:',
  '  doctor                           Check the health',
  '  mcp|server                       Manage servers',
].join('\n');

describe('parseHelp', () => {
  test('lists every flag once and reads the version from the --version text', () => {
    const parsed = parseHelp(HELP + '\n--model <model> again', '2.1.308 (Claude Code)');
    assert.equal(parsed.version, '2.1.308');
    assert.equal(parsed.flags.filter(flag => flag === '--model').length, 1);
    assert.ok(parsed.flags.includes('--include-partial-messages'));
    assert.ok(parsed.flags.includes('--permission-mode'));
  });

  test('reads the permission mode choices from the help text', () => {
    assert.deepEqual(parseHelp(HELP, '2.1.0').permissionModes, ['default', 'acceptEdits', 'plan']);
  });

  test('falls back to the known modes when the help text names no choices', () => {
    assert.deepEqual(parseHelp('--model <model>', '').permissionModes,
      ['default', 'acceptEdits', 'plan', 'bypassPermissions']);
  });

  test('reads the sub-commands listed after "Commands:", with aliases dropped', () => {
    assert.deepEqual(parseHelp(HELP, '2.1.0').commands, ['doctor', 'mcp']);
  });
});

describe('cliPermissionMode and hasFlag', () => {
  test('renames default and manual to whichever one the CLI knows', () => {
    assert.equal(cliPermissionMode('default', { permissionModes: ['manual', 'plan'] }), 'manual');
    assert.equal(cliPermissionMode('manual', { permissionModes: ['default', 'plan'] }), 'default');
  });

  test('keeps a mode the CLI lists as it is', () => {
    assert.equal(cliPermissionMode('plan', { permissionModes: ['default', 'plan'] }), 'plan');
  });

  test('hasFlag checks the detected flag list exactly', () => {
    const capabilities = { flags: ['--model', '--effort'] };
    assert.equal(hasFlag(capabilities, '--effort'), true);
    assert.equal(hasFlag(capabilities, '--eff'), false);
  });
});
