// Tool limits: which names a PATCH may carry (lib/tool-limits/tool-names.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toolChanges } = require('../lib/tool-limits/tool-names');

test('MCP server names of the real CLI (spaces, dots) pass; control characters do not', () => {
  assert.deepEqual(toolChanges({ mcpOff: ['claude.ai Gmail', 'claude-artifacts'] }).mcpOff, ['claude.ai Gmail', 'claude-artifacts']);
  assert.throws(() => toolChanges({ mcpOff: ['bad\nname'] }), { status: 400 });
  assert.throws(() => toolChanges({ mcpOff: [' lead'] }), { status: 400 });
});

test('tool names stay plain identifiers', () => {
  assert.deepEqual(toolChanges({ toolsOnly: ['Read', 'mcp__srv__tool'] }).toolsOnly, ['Read', 'mcp__srv__tool']);
  assert.throws(() => toolChanges({ toolsOnly: ['Bash(git:*)'] }), { status: 400 });
});
