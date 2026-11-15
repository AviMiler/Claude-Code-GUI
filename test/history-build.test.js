// Unit tests for lib/history-build.js: the items a session shows, built from the CLI's conversation lines plus the GUI's own items.
// Pure: the conversations are passed in, so no file is read.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildItems } = require('../lib/history-build');

const user = (uuid, text, parentUuid = null) => ({ type: 'user', uuid, parentUuid, message: { content: text } });
const assistant = (uuid, text, parentUuid) => ({ type: 'assistant', uuid, parentUuid, message: { content: [{ type: 'text', text }] } });
const kinds = items => items.map(item => (item.kind === 'user' ? `user:${item.text}` : `${item.kind}${item.text ? `:${item.text}` : ''}`));

describe('buildItems: the CLI conversation as items', () => {
  test('a typed message and an answer come out in order, the message keeping its CLI uuid', () => {
    const { items } = buildItems({}, [{ id: 'c1', current: true, lines: [user('u1', 'hi'), assistant('a1', 'hello', 'u1')] }]);
    assert.deepEqual(kinds(items), ['user:hi', 'text:hello']);
    assert.equal(items[0].cliUuid, 'u1');
    assert.equal(items[0].cliSession, 'c1');
  });

  test('a conversation with no file yet gives no items and an empty chain', () => {
    const { items, chains } = buildItems({}, [{ id: 'c1', current: true, lines: null }]);
    assert.deepEqual(items, []);
    assert.deepEqual(chains, [[]]);
  });

  test('only the chain the CLI resumes is shown: a line left behind by a rewind is not', () => {
    const lines = [user('u1', 'first'), assistant('a1', 'answer one', 'u1'), user('u2', 'dropped', 'a1'), user('u3', 'kept', 'a1')];
    const { items } = buildItems({}, [{ id: 'c1', current: true, lines, leaf: 'u3' }]);
    // The first turn was run by another program and ended before 'kept': it gets a result item (turn-results.js).
    assert.deepEqual(kinds(items), ['user:first', 'text:answer one', 'result', 'user:kept']);
    assert.equal(items[2].fromFile, true);
  });
});

describe('buildItems: GUI items placed by their anchors', () => {
  const conversation = { id: 'c1', current: true, lines: [user('u1', 'hi'), assistant('a1', 'hello', 'u1')] };

  test('a GUI item goes right after the line it is anchored to', () => {
    const session = { extras: [{ anchors: ['a1'], item: { kind: 'result', text: '' } }] };
    assert.deepEqual(kinds(buildItems(session, [conversation]).items), ['user:hi', 'text:hello', 'result']);
  });

  test('a GUI item with no anchor is shown at the start of the current conversation', () => {
    const session = { extras: [{ anchors: [], item: { kind: 'notice', text: 'start' } }] };
    assert.deepEqual(kinds(buildItems(session, [conversation]).items), ['notice:start', 'user:hi', 'text:hello']);
  });

  test('a GUI item whose anchors are all gone (a rewind removed them) is left out', () => {
    const session = { extras: [{ anchors: ['removed-uuid'], item: { kind: 'notice', text: 'gone' } }] };
    assert.deepEqual(kinds(buildItems(session, [conversation]).items), ['user:hi', 'text:hello']);
  });
});

describe('buildItems: messages the GUI sent', () => {
  test('a message shown as it was typed (with its images) replaces the CLI text while the CLI still holds it as sent', () => {
    const session = { sent: { u1: { text: 'What I typed', sentText: 'hi', images: [{ id: 'img-1' }] } } };
    const [first] = buildItems(session, [{ id: 'c1', current: true, lines: [user('u1', 'hi')] }]).items;
    assert.equal(first.text, 'What I typed');
    assert.deepEqual(first.images, [{ id: 'img-1' }]);
  });

  test('when the CLI holds different text, the CLI text is shown instead', () => {
    const session = { sent: { u1: { text: 'What I typed', sentText: 'something else' } } };
    const [first] = buildItems(session, [{ id: 'c1', current: true, lines: [user('u1', 'hi')] }]).items;
    assert.equal(first.text, 'hi');
  });
});

describe('buildItems: several conversations (before and after /clear)', () => {
  test('the older conversation comes first, then the current one with its start items', () => {
    const older = { id: 'old', lines: [user('o1', 'before clear')] };
    const current = { id: 'new', current: true, lines: [user('n1', 'after clear')] };
    const session = { extras: [{ anchors: [], item: { kind: 'notice', text: 'start of current' } }] };
    const { items, chains } = buildItems(session, [older, current]);
    assert.deepEqual(kinds(items), ['user:before clear', 'notice:start of current', 'user:after clear']);
    assert.equal(chains.length, 2);
  });
});
