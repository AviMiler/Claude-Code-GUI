// Unit tests for lib/sync/turn-outcome.js: the outcome sent with `status: idle`, so a tab without the session's items
// can still notify (done / error / nothing after a user stop).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { turnOutcome } = require('../lib/sync/turn-outcome');

const user = { kind: 'user', text: 'q' };

test('a finished turn is done', () => {
  assert.equal(turnOutcome([user, { kind: 'text', text: 'a' }, { kind: 'result', isError: false }]), 'done');
});

test('an error item, a loop stop or a failed result is an error', () => {
  assert.equal(turnOutcome([user, { kind: 'error', text: 'crash' }]), 'error');
  assert.equal(turnOutcome([user, { kind: 'notice', loopStopped: true }]), 'error');
  assert.equal(turnOutcome([user, { kind: 'result', isError: true }]), 'error');
});

test('a user stop tells nothing', () => {
  assert.equal(turnOutcome([user, { kind: 'notice', text: 'הריצה הופסקה.', stopped: true }]), null);
});

test('only the last turn counts; a correction does not start a turn', () => {
  const items = [user, { kind: 'error' }, user, { kind: 'user', text: 'fix', correction: true }, { kind: 'result', isError: false }];
  assert.equal(turnOutcome(items), 'done');
  assert.equal(turnOutcome([user, { kind: 'error' }, { kind: 'user', text: 'c', correction: true }]), 'error');
  assert.equal(turnOutcome([]), 'done');
});
