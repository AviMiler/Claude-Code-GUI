// Unit tests for the sidebar's section arrangement (public/js/sidebar/arrange.js): pinned, groups, grouping and sort.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../public/js/sidebar/arrange.js');
const now = Date.now();
const session = (id, extra) => ({ id, name: id, cwd: `/work/${id}`, createdAt: now, updatedAt: now, ...extra });
const ids = section => section.sessions.map(item => item.id);
const groups = [{ id: 'g1', name: 'Work' }, { id: 'g2', name: 'Empty' }];

describe('arrange', () => {
  test('pinned first in their manual order, then groups, then the rest', async () => {
    const { arrange } = await load();
    const list = [session('a'), session('b', { pinned: true, pinOrder: 2 }), session('c', { pinned: true, pinOrder: 1 }), session('d', { groupId: 'g1' })];
    const sections = arrange(list, { grouping: 'none', sort: 'activity', groups });
    assert.deepEqual(sections.map(section => section.id), ['pinned', 'g:g1', 'g:g2', 'all']);
    assert.deepEqual(ids(sections[0]), ['c', 'b']);
    assert.deepEqual(ids(sections[1]), ['d']);
    assert.deepEqual(ids(sections[3]), ['a']);
  });

  test('a pinned session is not repeated in its group; an unknown group id means ungrouped', async () => {
    const { arrange } = await load();
    const list = [session('a', { pinned: true, groupId: 'g1' }), session('b', { groupId: 'gone' })];
    const sections = arrange(list, { grouping: 'none', sort: 'activity', groups });
    assert.deepEqual(ids(sections.find(section => section.id === 'g:g1')), []);
    assert.deepEqual(ids(sections.find(section => section.id === 'all')), ['b']);
  });

  test('empty groups are kept, or hidden while searching', async () => {
    const { arrange } = await load();
    assert.equal(arrange([], { grouping: 'date', sort: 'activity', groups }).length, 2);
    assert.equal(arrange([], { grouping: 'date', sort: 'activity', groups, hideEmptyGroups: true }).length, 0);
  });

  test('sorts by name or by creation inside a section', async () => {
    const { arrange } = await load();
    const list = [session('b', { createdAt: 1 }), session('a', { createdAt: 2 }), session('c', { createdAt: 3 })];
    assert.deepEqual(ids(arrange(list, { grouping: 'none', sort: 'name', groups: [] })[0]), ['a', 'b', 'c']);
    assert.deepEqual(ids(arrange(list, { grouping: 'none', sort: 'created', groups: [] })[0]), ['c', 'a', 'b']);
  });

  test('by project: one section per folder, a worktree under its source folder', async () => {
    const { arrange } = await load();
    const list = [session('a', { cwd: '/p/one' }), session('b', { cwd: '/p/one/wt', worktree: { source: '/p/one' } }), session('c', { cwd: '/p/two' })];
    const sections = arrange(list, { grouping: 'project', sort: 'activity', groups: [] });
    assert.deepEqual(sections.map(section => section.title), ['one', 'two']);
    assert.deepEqual(ids(sections[0]).sort(), ['a', 'b']);
  });

  test('by date: today and older are separate sections', async () => {
    const { arrange } = await load();
    const list = [session('new'), session('old', { updatedAt: now - 90 * 86400000, createdAt: now - 90 * 86400000 })];
    assert.deepEqual(arrange(list, { grouping: 'date', sort: 'activity', groups: [] }).map(section => section.title), ['היום', 'ישן יותר']);
  });
});
