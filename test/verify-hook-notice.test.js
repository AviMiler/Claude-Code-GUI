// The CLI's "Stop hook error" notice is hidden only after this session's verify check blocked a stop in this turn.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.CLAUDE_GUI_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-notice-'));
const runtime = require('../lib/session-runtime');
let hooks = null;
const realInit = runtime.init;
runtime.init = given => { hooks = given; };
const store = require('../lib/session-store');
const state = require('../lib/verify/verify-state');
require('../lib/session-events');
runtime.init = realInit;

test('the Stop hook error notice is dropped only after a verify block', () => {
  const session = store.create({ name: 'n', cwd: process.cwd(), mode: 'default' });
  const notice = { kind: 'notice', text: 'Stop hook error occurred · ctrl+o to see', level: 'info' };
  const event = { type: 'system', subtype: 'informational' };
  hooks.onItem(session.id, notice, event);
  assert.equal(store.get(session.id).extras.length, 1, 'a user hook error stays visible');
  state.addFailure(session.id);
  hooks.onItem(session.id, notice, event);
  assert.equal(store.get(session.id).extras.length, 1, 'hidden once the check has blocked');
  state.resetAttempts(session.id);
});
