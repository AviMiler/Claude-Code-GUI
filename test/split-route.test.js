// Unit tests for where a "/" line typed in the split pane's composer goes (public/js/split-route.js): /btw opens the side question tab.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => Promise.all([import('../public/js/split-route.js'), import('../public/js/command-catalog.js')]);

describe('routeSplitInput', () => {
  test('/btw with a question is a side question, never a normal message', async () => {
    const [{ routeSplitInput }, { buildCommands }] = await load();
    assert.deepEqual(routeSplitInput('/btw which file is open?', buildCommands(null)), { kind: 'side', question: 'which file is open?' });
  });

  test('/btw alone only focuses the side question input (empty question)', async () => {
    const [{ routeSplitInput }, { buildCommands }] = await load();
    assert.deepEqual(routeSplitInput('  /btw  ', buildCommands(null)), { kind: 'side', question: '' });
  });

  test('a GUI command is refused in the pane (it would act on the main session); a CLI command is sent', async () => {
    const [{ routeSplitInput }, { buildCommands }] = await load();
    const commands = buildCommands(null);
    assert.deepEqual(routeSplitInput('/clear', commands), { kind: 'blocked', name: 'clear' });
    assert.deepEqual(routeSplitInput('/import codex', commands), { kind: 'send' });
  });

  test('ordinary text and unknown slash lines are plain messages; a path is not a command', async () => {
    const [{ routeSplitInput }, { buildCommands }] = await load();
    const commands = buildCommands(null);
    assert.deepEqual(routeSplitInput('hello /btw there', commands), { kind: 'send' });
    assert.deepEqual(routeSplitInput('/no-such-thing x', commands), { kind: 'send' });
    assert.deepEqual(routeSplitInput('/usr/bin/env', commands), { kind: 'send' });
  });
});

describe('routeCommand', () => {
  test('a menu pick of /btw is a side question without text', async () => {
    const [{ routeCommand }] = await load();
    assert.deepEqual(routeCommand({ name: 'btw', run: 'action:btw' }), { kind: 'side', question: '' });
    assert.deepEqual(routeCommand({ name: 'mcp', run: 'panel:mcp' }), { kind: 'blocked', name: 'mcp' });
    assert.deepEqual(routeCommand({ name: 'init', run: 'send' }), { kind: 'send' });
  });
});
