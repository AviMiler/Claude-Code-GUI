// Unit tests for lib/transcripts/turn-results.js: result items for turns another program (a terminal) ran in a conversation.
// Pure: the chain of lines is passed in.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { fileResults } = require('../lib/transcripts/turn-results');
const { ENTRYPOINT } = require('../lib/session-env');

const typed = (uuid, timestamp, extra = {}) => ({ type: 'user', uuid, timestamp, message: { content: 'question' }, ...extra });
const answer = (uuid, timestamp, messageId, stop, usage = {}) => ({
  type: 'assistant', uuid, timestamp, message: { id: messageId, stop_reason: stop, content: [{ type: 'text', text: 'x' }], usage },
});
const toolResult = (uuid, timestamp) => ({
  type: 'user', uuid, timestamp, message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] },
});

describe('fileResults: a finished turn another program ran', () => {
  test('a finished turn gets one result after its last line, with its time, answers and tokens', () => {
    const chain = [
      typed('u1', '2026-11-15T10:00:00.000Z'),
      answer('a1', '2026-11-15T10:00:02.000Z', 'm1', 'tool_use', { input_tokens: 10, output_tokens: 5 }),
      toolResult('r1', '2026-11-15T10:00:03.000Z'),
      answer('a2', '2026-11-15T10:00:08.000Z', 'm2', 'end_turn', { input_tokens: 4, output_tokens: 7, cache_read_input_tokens: 2 }),
    ];
    const results = fileResults(chain);
    assert.deepEqual([...results.keys()], ['a2']);
    const { item, uuids } = results.get('a2');
    assert.equal(item.kind, 'result');
    assert.equal(item.fromFile, true);
    assert.equal(item.durationMs, 8000);
    assert.equal(item.turns, 2);
    assert.equal(item.costUsd, null);
    assert.deepEqual(item.usage, { input: 14, output: 12, cacheRead: 2, cacheWrite: 0 });
    assert.deepEqual(uuids, ['u1', 'a1', 'r1', 'a2']);
  });

  test('a tool result does not start a new turn', () => {
    const chain = [typed('u1', '2026-11-15T10:00:00.000Z'), toolResult('r1', '2026-11-15T10:00:01.000Z'),
      answer('a1', '2026-11-15T10:00:02.000Z', 'm1', 'end_turn')];
    assert.equal(fileResults(chain).get('a1').uuids.length, 3);
  });

  test('the last turn gets no result while it has not ended', () => {
    const chain = [typed('u1', '2026-11-15T10:00:00.000Z'), answer('a1', '2026-11-15T10:00:02.000Z', 'm1', 'tool_use')];
    assert.equal(fileResults(chain).size, 0);
  });

  test('a turn of the GUI itself gets no result here (its result is in the session)', () => {
    const chain = [typed('u1', '2026-11-15T10:00:00.000Z', { entrypoint: ENTRYPOINT }),
      answer('a1', '2026-11-15T10:00:02.000Z', 'm1', 'end_turn')];
    assert.equal(fileResults(chain).size, 0);
  });
});
