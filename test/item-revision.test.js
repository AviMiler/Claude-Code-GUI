// Unit tests for lib/sync/item-revision.js: a browser that holds a session's items fetches only the new ones, and the
// whole list when the list was rewritten (rewind, compaction, CLI sync) or what it holds does not fit.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { revOf, bump, forget, itemsSince } = require('../lib/sync/item-revision');

const items = n => Array.from({ length: n }, (_, index) => ({ kind: 'text', text: `t${index}` }));

describe('item revisions', () => {
  test('appending keeps the revision; a rebuild gives a new one', () => {
    const before = revOf('r1');
    assert.equal(revOf('r1'), before);
    const after = bump('r1');
    assert.notEqual(after, before);
    assert.equal(revOf('r1'), after);
    assert.match(after, /^[0-9a-z]+\.1$/);
  });

  test('forget resets a deleted session', () => {
    bump('r2');
    forget('r2');
    assert.match(revOf('r2'), /\.0$/);
  });
});

describe('itemsSince', () => {
  test('the same revision gets the items after the ones held', () => {
    const session = { id: 'd1', items: items(5) };
    const answer = itemsSince(session, revOf('d1'), '3');
    assert.deepEqual(answer, { rev: revOf('d1'), from: 3, items: session.items.slice(3), total: 5, full: false });
  });

  test('nothing new: an empty list', () => {
    const session = { id: 'd2', items: items(4) };
    const answer = itemsSince(session, revOf('d2'), 4);
    assert.equal(answer.full, false);
    assert.deepEqual(answer.items, []);
  });

  test('another revision (a rewind rebuilt the list) gets the whole list', () => {
    const session = { id: 'd3', items: items(2) };
    const held = revOf('d3');
    bump('d3');
    const answer = itemsSince(session, held, 6);
    assert.equal(answer.full, true);
    assert.equal(answer.from, 0);
    assert.equal(answer.items.length, 2);
    assert.equal(answer.rev, revOf('d3'));
  });

  test('no revision, a count past the end or not a number: the whole list', () => {
    const session = { id: 'd4', items: items(3) };
    for (const [rev, since] of [[undefined, undefined], [revOf('d4'), 9], [revOf('d4'), 'x'], [revOf('d4'), -1], [revOf('d4'), 1.5]]) {
      assert.equal(itemsSince(session, rev, since).full, true, `${rev} ${since}`);
    }
  });

  test('a revision from an older server run never matches', () => {
    const session = { id: 'd5', items: items(3) };
    assert.equal(itemsSince(session, 'oldepoch.0', 1).full, true);
  });
});
