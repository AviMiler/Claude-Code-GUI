// Unit tests for lib/event-translator.js (pure: no files, no network, no server).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  translateEvent, translateDelta, readInit, readTaskEvent, localCommandOutput,
} = require('../lib/event-translator');

describe('translateEvent: assistant messages', () => {
  test('keeps text, thinking and tool calls in order and skips blank text', () => {
    const items = translateEvent({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: '   ' },
          { type: 'thinking', thinking: 'let me think' },
          { type: 'text', text: 'hello' },
          { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    });
    assert.deepEqual(items, [
      { kind: 'thinking', text: 'let me think', parent: null },
      { kind: 'text', text: 'hello', parent: null },
      { kind: 'tool', id: 'tool-1', name: 'Bash', input: { command: 'ls' }, parent: null },
    ]);
  });

  test('marks items of a subagent with the tool call that started it', () => {
    const [item] = translateEvent({
      type: 'assistant', parent_tool_use_id: 'agent-7',
      message: { content: [{ type: 'text', text: 'inside' }] },
    });
    assert.equal(item.parent, 'agent-7');
  });
});

describe('translateEvent: user messages', () => {
  test('turns a tool result into a tool-result item, with images shown as a marker', () => {
    const [item] = translateEvent({
      type: 'user',
      message: {
        content: [{
          type: 'tool_result', tool_use_id: 'tool-1', is_error: true,
          content: [{ type: 'text', text: 'first' }, { type: 'image', source: {} }],
        }],
      },
    });
    assert.equal(item.kind, 'tool-result');
    assert.equal(item.toolUseId, 'tool-1');
    assert.equal(item.isError, true);
    assert.equal(item.text, 'first\n[תמונה]');
  });

  test('cuts a very long tool result to 20000 characters with a marker', () => {
    const long = 'x'.repeat(25000);
    const [item] = translateEvent({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't', content: long }] },
    });
    assert.equal(item.text, `${'x'.repeat(20000)}\n… (קוצר)`);
  });

  test('ignores replayed user messages (already shown when they were sent)', () => {
    assert.deepEqual(translateEvent({ type: 'user', isReplay: true, message: { content: 'hi' } }), []);
  });

  test('shows slash-command output wrapped in local-command tags, without ANSI codes', () => {
    const items = translateEvent({
      type: 'user',
      message: { content: '<local-command-stdout>\x1b[32mtotal 3\x1b[0m</local-command-stdout>' },
    });
    assert.deepEqual(items, [{ kind: 'command-output', text: 'total 3' }]);
  });

  test('localCommandOutput returns null for plain text', () => {
    assert.equal(localCommandOutput('just a question'), null);
  });
});

describe('translateEvent: result and system events', () => {
  test('a successful result keeps time, cost, turns and usage, but no text (already shown)', () => {
    const [item] = translateEvent({
      type: 'result', subtype: 'success', is_error: false, result: 'done',
      duration_ms: 1200, duration_api_ms: 900, total_cost_usd: 0.02, num_turns: 3,
      usage: { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 },
    });
    assert.deepEqual(item, {
      kind: 'result', isError: false, subtype: 'success', text: '',
      durationMs: 1200, durationApiMs: 900, costUsd: 0.02, turns: 3,
      usage: { input: 5, output: 7, cacheRead: 3, cacheWrite: 4 },
    });
  });

  test('a result with a non-success subtype is an error and carries its errors', () => {
    const [item] = translateEvent({ type: 'result', subtype: 'error_max_turns', errors: ['too many', 'turns'] });
    assert.equal(item.isError, true);
    assert.equal(item.text, 'too many\nturns');
    assert.equal(item.usage, null);
  });

  test('an api_retry notice shows attempt and max, with ? when they are missing', () => {
    assert.deepEqual(translateEvent({ type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 10 }),
      [{ kind: 'notice', text: 'ניסיון חוזר מול ה-API (2/10)' }]);
    assert.deepEqual(translateEvent({ type: 'system', subtype: 'api_retry' }),
      [{ kind: 'notice', text: 'ניסיון חוזר מול ה-API (?/?)' }]);
  });

  test('an unknown system subtype produces no items', () => {
    assert.deepEqual(translateEvent({ type: 'system', subtype: 'something_new', content: 'x' }), []);
  });
});

describe('translateDelta: streaming tokens', () => {
  test('streams top-level text and thinking deltas', () => {
    assert.deepEqual(translateDelta({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'he' } } }),
      { kind: 'text', text: 'he' });
    assert.deepEqual(translateDelta({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hm' } } }),
      { kind: 'thinking', text: 'hm' });
  });

  test('ignores deltas of a subagent and events that are not content deltas', () => {
    const delta = { type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } };
    assert.equal(translateDelta({ type: 'stream_event', parent_tool_use_id: 'agent-1', event: delta }), null);
    assert.equal(translateDelta({ type: 'stream_event', event: { type: 'message_start' } }), null);
  });
});

describe('readTaskEvent and readInit', () => {
  test('a started task is running, with its type, agent and usage', () => {
    const task = readTaskEvent({
      type: 'system', subtype: 'task_started', task_id: 'b1', description: 'build', task_type: 'shell',
      subagent_type: 'Explore', is_backgrounded: true, usage: { total_tokens: 10, tool_uses: 2, duration_ms: 500 },
    });
    assert.equal(task.id, 'b1');
    assert.equal(task.phase, 'started');
    assert.equal(task.fields.status, 'running');
    assert.equal(task.fields.agent, 'Explore');
    assert.deepEqual(task.fields.usage, { tokens: 10, toolUses: 2, durationMs: 500 });
  });

  test('a finished task with an unknown status is counted as completed', () => {
    const task = readTaskEvent({ type: 'system', subtype: 'task_notification', task_id: 'b1', status: 'weird', summary: 'ok' });
    assert.equal(task.phase, 'ended');
    assert.equal(task.fields.status, 'completed');
    assert.equal(task.fields.summary, 'ok');
  });

  test('readTaskEvent returns null for events that are not about a task', () => {
    assert.equal(readTaskEvent({ type: 'system', subtype: 'task_started' }), null);
    assert.equal(readTaskEvent({ type: 'assistant', task_id: 'b1' }), null);
  });

  test('readInit gives the facts of the init event and empty lists when they are missing', () => {
    const init = readInit({ type: 'system', subtype: 'init', model: 'm1', permissionMode: 'default', claude_code_version: '2.1.0' });
    assert.equal(init.model, 'm1');
    assert.equal(init.version, '2.1.0');
    assert.deepEqual(init.tools, []);
    assert.deepEqual(init.mcpServers, []);
    assert.equal(readInit({ type: 'system', subtype: 'compact_boundary' }), null);
  });
});
