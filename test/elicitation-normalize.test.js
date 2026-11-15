// Unit tests for lib/elicitation/elicitation-normalize.js: an MCP elicitation request turned into a drawable prompt.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeElicitation } = require('../lib/elicitation/elicitation-normalize');

const fieldNamed = (prompt, name) => prompt.fields.find(field => field.name === name);

describe('normalizeElicitation: the prompt header', () => {
  test('a form request keeps its server, message and mode, and reads the schema under the known key names', () => {
    const prompt = normalizeElicitation('req-1', {
      mcp_server_name: 'github', message: 'Who are you?', mode: 'form',
      requested_schema: { required: ['login'], properties: { login: { type: 'string', title: 'Login' } } },
    });
    assert.equal(prompt.requestId, 'req-1');
    assert.equal(prompt.kind, 'elicitation');
    assert.equal(prompt.serverName, 'github');
    assert.equal(prompt.message, 'Who are you?');
    assert.equal(prompt.mode, 'form');
    assert.equal(prompt.url, '');
    assert.equal(prompt.fields.length, 1);
    assert.equal(fieldNamed(prompt, 'login').required, true);
  });

  test('a missing server name becomes "MCP"; the camelCase schema key works too', () => {
    const prompt = normalizeElicitation('r', { requestedSchema: { properties: { x: { type: 'boolean' } } } });
    assert.equal(prompt.serverName, 'MCP');
    assert.equal(prompt.fields[0].type, 'boolean');
  });

  test('a url request has no fields and keeps its url', () => {
    const prompt = normalizeElicitation('r', {
      mode: 'url', url: 'https://example.com/login', message: 'Sign in',
      requested_schema: { properties: { ignored: { type: 'string' } } },
    });
    assert.equal(prompt.mode, 'url');
    assert.equal(prompt.url, 'https://example.com/login');
    assert.deepEqual(prompt.fields, []);
  });

  test('text from the server is cut to its size limits', () => {
    const prompt = normalizeElicitation('r', {
      mcp_server_name: 's'.repeat(150), message: 'm'.repeat(5000), mode: 'url', url: 'u'.repeat(3000),
    });
    assert.equal(prompt.serverName.length, 100);
    assert.equal(prompt.message.length, 4000);
    assert.equal(prompt.url.length, 2048);
  });
});

describe('normalizeElicitation: field types', () => {
  test('a string with a fixed list becomes a select; enumNames give the labels', () => {
    const prompt = normalizeElicitation('r', {
      requested_schema: { properties: { size: { type: 'string', enum: ['s', 'm'], enumNames: ['Small'] } } },
    });
    const size = fieldNamed(prompt, 'size');
    assert.equal(size.type, 'select');
    assert.deepEqual(size.options, [{ value: 's', label: 'Small' }, { value: 'm', label: 'm' }]);
  });

  test('oneOf gives labels from title and drops options that are neither text nor a number', () => {
    const prompt = normalizeElicitation('r', {
      requested_schema: { properties: { plan: { type: 'string', oneOf: [
        { const: 'pro', title: 'Pro' }, { const: null, title: 'bad' }, { const: 3, title: 'Three' },
      ] } } },
    });
    assert.deepEqual(fieldNamed(prompt, 'plan').options, [{ value: 'pro', label: 'Pro' }, { value: 3, label: 'Three' }]);
  });

  test('an array of choices becomes a multiselect; an array with no choices becomes json', () => {
    const prompt = normalizeElicitation('r', {
      requested_schema: { properties: {
        tags: { type: 'array', items: { enum: ['a', 'b'] } },
        free: { type: 'array', items: { type: 'object' } },
      } },
    });
    assert.equal(fieldNamed(prompt, 'tags').type, 'multiselect');
    assert.equal(fieldNamed(prompt, 'free').type, 'json');
  });

  test('numbers keep their range and a type the card cannot draw becomes json', () => {
    const prompt = normalizeElicitation('r', {
      requested_schema: { properties: {
        n: { type: 'integer', minimum: 1, maximum: 5 },
        odd: { type: 'object' },
      } },
    });
    assert.deepEqual({ ...fieldNamed(prompt, 'n') }, { name: 'n', title: 'n', description: '', required: false, default: undefined, type: 'integer', min: 1, max: 5 });
    assert.equal(fieldNamed(prompt, 'odd').type, 'json');
  });
});

describe('normalizeElicitation: limits', () => {
  test('no more than 50 fields are kept', () => {
    const properties = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`f${index}`, { type: 'string' }]));
    assert.equal(normalizeElicitation('r', { requested_schema: { properties } }).fields.length, 50);
  });
});
