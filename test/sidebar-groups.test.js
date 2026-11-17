// Unit tests for lib/sidebar-groups/: the group store (names, ids, persistence) and the checks of a session's sidebar fields.
const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGroupStore, MAX_NAME, MAX_GROUPS } = require('../lib/sidebar-groups/group-store');
const { sidebarChanges, completionReset } = require('../lib/sidebar-groups/session-flags');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-groups-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
let counter = 0;
const newStore = () => createGroupStore({ file: path.join(dir, `groups-${counter++}.json`) });
const status = (fn, code) => assert.throws(fn, error => error.status === code);

describe('group store', () => {
  test('creates with a server id, trims and caps the name', () => {
    const groups = newStore();
    const group = groups.create('   Work   items  ');
    assert.equal(group.name, 'Work items');
    assert.match(group.id, /^g_[0-9a-f]{12}$/);
    assert.equal(groups.create('x'.repeat(200)).name.length, MAX_NAME);
  });

  test('refuses an empty, a non-string and a duplicate name', () => {
    const groups = newStore();
    groups.create('A');
    status(() => groups.create('   '), 400);
    status(() => groups.create(5), 400);
    status(() => groups.create('a'), 409);
  });

  test('refuses more than the maximum', () => {
    const groups = newStore();
    for (let i = 0; i < MAX_GROUPS; i++) groups.create(`g${i}`);
    status(() => groups.create('one more'), 409);
  });

  test('renames, deletes, and answers 404 for an unknown id', () => {
    const groups = newStore();
    const { id } = groups.create('Old');
    assert.equal(groups.rename(id, ' New ').name, 'New');
    status(() => groups.rename('nope', 'X'), 404);
    assert.equal(groups.remove(id), true);
    assert.equal(groups.has(id), false);
    status(() => groups.remove(id), 404);
  });

  test('reorders: unknown ids ignored, left-out groups keep their order at the end', () => {
    const groups = newStore();
    const [a, b, c] = ['a', 'b', 'c'].map(name => groups.create(name));
    assert.deepEqual(groups.reorder([c.id, 'ghost', a.id]).map(group => group.name), ['c', 'a', 'b']);
    status(() => groups.reorder('c'), 400);
    assert.ok(b);
  });

  test('is the same after a reload from the file', () => {
    const file = path.join(dir, 'persist.json');
    const first = createGroupStore({ file });
    const { id } = first.create('Kept');
    assert.deepEqual(createGroupStore({ file }).list(), [{ id, name: 'Kept' }]);
  });

  test('a corrupt file starts empty and is not thrown at', () => {
    const file = path.join(dir, 'corrupt.json');
    fs.writeFileSync(file, '{ not json');
    assert.deepEqual(createGroupStore({ file }).list(), []);
  });
});

describe('sidebar fields of a session', () => {
  const deps = { hasGroup: id => id === 'g_ok', nextPinOrder: () => 7 };
  const check = (patch, current = {}) => sidebarChanges(patch, current, deps);

  test('takes booleans, a numeric order and an existing group', () => {
    assert.deepEqual(check({ completed: true, markedUnread: false, pinOrder: 2.5, groupId: 'g_ok' }),
      { completed: true, markedUnread: false, pinOrder: 2.5, groupId: 'g_ok' });
    assert.deepEqual(check({ groupId: null }), { groupId: null });
  });

  test('a patch without sidebar fields changes nothing', () => {
    assert.deepEqual(check({ name: 'x', mode: 'plan' }), {});
  });

  test('rejects wrong types and a group that does not exist', () => {
    for (const patch of [{ pinned: 'yes' }, { completed: 1 }, { markedUnread: null }, { pinOrder: '3' }, { pinOrder: NaN }, { pinOrder: Infinity },
      { groupId: 'g_missing' }, { groupId: 5 }, { groupId: '' }]) status(() => check(patch), 400);
  });

  test('pinning gives the next place unless one is given or already held', () => {
    assert.deepEqual(check({ pinned: true }), { pinned: true, pinOrder: 7 });
    assert.deepEqual(check({ pinned: true, pinOrder: 1 }), { pinned: true, pinOrder: 1 });
    assert.deepEqual(check({ pinned: true }, { pinOrder: 3 }), { pinned: true });
    assert.deepEqual(check({ pinned: false }), { pinned: false });
  });

  test('an archived session is never pinned', () => {
    assert.equal('pinned' in check({ pinned: true }, { archived: true }), false);
  });

  test('a new turn resets completed, and only that', () => {
    assert.deepEqual(completionReset({ completed: true }, 'running'), { completed: false });
    assert.equal(completionReset({ completed: true }, 'idle'), null);
    assert.equal(completionReset({ completed: false }, 'running'), null);
    assert.equal(completionReset(undefined, 'running'), null);
  });
});
