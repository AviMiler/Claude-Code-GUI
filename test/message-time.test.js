// Unit tests for message times: the `at` of user and answer items (lib/sync/item-time.js, through lib/history-build.js)
// and the text the thread shows for it (public/js/transcript/message-time.js, its DOM-free part).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { lineTime, withLineTime, stampNow, withoutTime } = require('../lib/sync/item-time');
const { buildItems } = require('../lib/history-build');

const ISO = '2026-11-19T10:00:00.000Z';
const MS = Date.parse(ISO);
const user = (uuid, text, timestamp, parentUuid = null) => ({ type: 'user', uuid, parentUuid, timestamp, message: { content: text } });
const assistant = (uuid, timestamp, parentUuid, content) => ({ type: 'assistant', uuid, parentUuid, timestamp, message: { content } });

describe('lineTime', () => {
  test('reads the ISO timestamp of a line as ms', () => assert.equal(lineTime({ timestamp: ISO }), MS));
  test('no timestamp, an unreadable one or a number: no time', () => {
    assert.equal(lineTime({}), undefined);
    assert.equal(lineTime({ timestamp: 'yesterday-ish' }), undefined);
    assert.equal(lineTime({ timestamp: 123 }), undefined);
    assert.equal(lineTime(null), undefined);
  });
});

describe('buildItems: message times from the file', () => {
  test('a typed message and the answer text carry the time of their line; a tool call does not', () => {
    const later = '2026-11-19T10:00:05.000Z';
    const lines = [user('u1', 'hi', ISO), assistant('a1', later, 'u1', [{ type: 'text', text: 'hello' }, { type: 'tool_use', id: 't1', name: 'Bash', input: {} }])];
    const { items } = buildItems({}, [{ id: 'c1', current: true, lines }]);
    assert.deepEqual(items.map(item => [item.kind, item.at]), [['user', MS], ['text', Date.parse(later)], ['tool', undefined]]);
  });

  test('a message the GUI sent keeps the time of the line, not of its display data', () => {
    const lines = [user('u1', 'sent text', ISO)];
    const { items } = buildItems({ sent: { u1: { text: 'typed', sentText: 'sent text' } } }, [{ id: 'c1', current: true, lines }]);
    assert.equal(items[0].text, 'typed');
    assert.equal(items[0].at, MS);
  });

  test('a line without a readable timestamp gives items without the field', () => {
    const { items } = buildItems({}, [{ id: 'c1', current: true, lines: [user('u1', 'hi', 'not a date')] }]);
    assert.equal('at' in items[0], false);
  });
});

describe('live items and comparing', () => {
  test('withLineTime leaves other kinds alone and does not change the input', () => {
    const items = [{ kind: 'thinking', text: 'x' }, { kind: 'text', text: 'y' }];
    assert.deepEqual(withLineTime(items, { timestamp: ISO }), [{ kind: 'thinking', text: 'x' }, { kind: 'text', text: 'y', at: MS }]);
    assert.equal('at' in items[1], false);
  });

  test('stampNow gives a live user or text item the received time, in place, once', () => {
    const item = { kind: 'user', text: 'hi' };
    assert.equal(stampNow(item, 5), item);
    assert.equal(item.at, 5);
    stampNow(item, 9);
    assert.equal(item.at, 5);
    const result = stampNow({ kind: 'result' }, 5);
    assert.equal('at' in result, false);
  });

  test('withoutTime drops only the top-level time', () => {
    assert.deepEqual(withoutTime({ kind: 'tool', input: { at: 1 }, at: 2 }), { kind: 'tool', input: { at: 1 } });
    const plain = { kind: 'text', text: 'a' };
    assert.equal(withoutTime(plain), plain);
  });
});

describe('messageTimeText (public/js/transcript/message-time.js)', () => {
  const load = () => import('../public/js/transcript/message-time.js');

  test('today: the time only; another day: the date and the time; a full title', async () => {
    const { messageTimeText } = await load();
    const at = new Date(2026, 10, 19, 9, 5).getTime();
    const today = messageTimeText(at, new Date(2026, 10, 19, 23, 0));
    assert.match(today.text, /^09:05$/);
    assert.match(today.title, /2026/);
    const other = messageTimeText(at, new Date(2026, 10, 20, 1, 0));
    assert.match(other.text, /19.*11.*09:05/);
  });

  test('no time, nothing shown', async () => {
    const { messageTimeText } = await load();
    assert.equal(messageTimeText(undefined), null);
    assert.equal(messageTimeText(Number.NaN), null);
  });
});
