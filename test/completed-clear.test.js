// A completed session is no longer completed when a new turn starts (lib/session-common.js setStatus, the one place a
// user message sets the status to running). Uses a temp data folder, set BEFORE requiring the store.
const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-done-'));
process.env.CLAUDE_GUI_DATA = dataDir;
const store = require('../lib/session-store');
const { setStatus } = require('../lib/session-common');

after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
process.on('exit', () => fs.rmSync(dataDir, { recursive: true, force: true }));

const make = extra => store.create({ name: 'x', cwd: dataDir, mode: 'default' }) && Object.assign(store.list().at(-1), extra);

describe('completed mark', () => {
  test('a new turn clears it', () => {
    const session = make({ completed: true });
    setStatus(session.id, 'running');
    assert.equal(store.get(session.id).completed, false);
  });

  test('finishing a turn leaves it as it was', () => {
    const session = make({ completed: true, status: 'running' });
    setStatus(session.id, 'idle');
    assert.equal(store.get(session.id).completed, true);
  });

  test('a session that was never completed stays without the field', () => {
    const session = make({});
    setStatus(session.id, 'running');
    assert.equal(store.get(session.id).completed, undefined);
  });
});
