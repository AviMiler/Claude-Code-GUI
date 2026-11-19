// Unit tests for the Ctrl+F find bar's decisions (public/js/transcript/find-logic.js) and its shortcut row.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../public/js/transcript/find-logic.js');
const at = overrides => ({ blocked: false, hasSession: true, focused: false, query: '', matched: 0, ...overrides });

describe('ctrlFDecision', () => {
  test('opens the bar in a pane that shows a session', async () => {
    const { ctrlFDecision } = await load();
    assert.equal(ctrlFDecision(at()), 'open');
  });

  test('leaves the key to the browser in a side pane, tab strip, modal, popover or dialog', async () => {
    const { ctrlFDecision } = await load();
    assert.equal(ctrlFDecision(at({ blocked: true })), 'browser');
  });

  test('leaves the key to the browser when the pane shows no session', async () => {
    const { ctrlFDecision } = await load();
    assert.equal(ctrlFDecision(at({ hasSession: false })), 'browser');
  });

  test('a second Ctrl+F in the bar after nothing was found is the browser find', async () => {
    const { ctrlFDecision } = await load();
    assert.equal(ctrlFDecision(at({ focused: true, query: 'xyz', matched: 0 })), 'browser');
  });

  test('a second Ctrl+F in the bar with matches, or with an empty query, focuses the bar again', async () => {
    const { ctrlFDecision } = await load();
    assert.equal(ctrlFDecision(at({ focused: true, query: 'npm', matched: 3 })), 'open');
    assert.equal(ctrlFDecision(at({ focused: true, query: '  ', matched: 0 })), 'open');
  });

  test('a query with no matches while the bar is not focused just focuses it', async () => {
    const { ctrlFDecision } = await load();
    assert.equal(ctrlFDecision(at({ focused: false, query: 'xyz', matched: 0 })), 'open');
  });
});

describe('findStatus', () => {
  test('empty query: no count', async () => {
    const { findStatus } = await load();
    assert.equal(findStatus('   ', 0), '');
  });

  test('no match: "אין התאמות"', async () => {
    const { findStatus, NO_MATCHES } = await load();
    assert.equal(NO_MATCHES, 'אין התאמות');
    assert.equal(findStatus('xyz', 0), NO_MATCHES);
  });

  test('matches: the stepper writes the count', async () => {
    const { findStatus } = await load();
    assert.equal(findStatus('npm', 2), null);
  });
});

describe('Ctrl+F shortcut row', () => {
  test('Ctrl+F (KeyF, no Shift, no Alt) is the optional find action; Ctrl+Shift+F and Ctrl+Alt+F are not', async () => {
    const { shortcutFor, SHORTCUTS } = await import('../public/js/shortcuts/shortcut-list.js');
    const key = (extra = {}) => ({ ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, code: 'KeyF', ...extra });
    const row = shortcutFor(key());
    assert.equal(row.action, 'findInSession');
    assert.equal(row.optional, true);
    assert.equal(row.group, 'conversation');
    assert.equal(shortcutFor(key({ ctrlKey: false, metaKey: true })).action, 'findInSession');
    assert.equal(shortcutFor(key({ shiftKey: true })), null);
    assert.equal(shortcutFor(key({ altKey: true })), null);
    assert.equal(SHORTCUTS.filter(item => item.optional).length, 1, 'only Ctrl+F may leave its key to the browser');
  });
});
