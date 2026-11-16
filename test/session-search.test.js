// Unit tests for lib/sync/session-search.js: the sidebar's "תוכן הסשנים" search over the GUI sessions' items on the
// server, with the result shape the sidebar and the "k מתוך N" bar use ({ count, indexes, snippet }).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { searchSessionContents, searchItems } = require('../lib/sync/session-search');

const session = (id, items) => ({ id, items });

describe('searchSessionContents', () => {
  test('finds user messages, answers and shell commands, with item indexes and a snippet', () => {
    const sessions = [
      session('a', [
        { kind: 'user', text: 'please run npm test' },
        { kind: 'thinking', text: 'npm test thinking is not searched' },
        { kind: 'tool', name: 'Bash', input: { command: 'npm test --watch=false' } },
        { kind: 'tool-result', text: 'npm test output is not searched' },
        { kind: 'text', text: 'NPM TEST passed' },
      ]),
      session('b', [{ kind: 'user', text: 'nothing here' }]),
    ];
    const { hits } = searchSessionContents(sessions, '  npm test ');
    assert.deepEqual(Object.keys(hits), ['a']);
    assert.deepEqual(hits.a.indexes, [0, 2, 4]);
    assert.equal(hits.a.count, 3);
    assert.deepEqual(hits.a.snippet, { before: 'please run ', match: 'npm test', after: '' });
  });

  test('Hebrew points are ignored and the snippet keeps the original text', () => {
    const { hits } = searchSessionContents([session('h', [{ kind: 'text', text: 'אמרתי שָׁלוֹם לכולם' }])], 'שלום');
    assert.equal(hits.h.snippet.match, 'שָׁלוֹם');
  });

  test('an empty query finds nothing', () => {
    assert.deepEqual(searchSessionContents([session('a', [{ kind: 'user', text: 'x' }])], '   ').hits, {});
  });

  test('a long snippet is cut with an ellipsis', () => {
    const text = `${'x'.repeat(60)} needle ${'y'.repeat(100)}`;
    const found = searchItems([{ kind: 'user', text }], 'needle');
    assert.ok(found.snippet.before.startsWith('…'));
    assert.equal(found.snippet.after.length, 70);
  });

  test('only the newest 3000 items are scanned, the count stops at 99', () => {
    const many = Array.from({ length: 3200 }, () => ({ kind: 'user', text: 'hit' }));
    const found = searchItems(many, 'hit');
    assert.equal(found.count, 99);
    assert.equal(found.indexes[0], 200);
    assert.equal(found.indexes.length, 3000);
  });
});
