// Unit tests for lib/model-list.js: which models the user can switch between. The server calls go to a throwaway
// HTTP server on 127.0.0.1; no network leaves the machine. Environment names are set in config.env (an empty string wins over process.env).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { listModels, configuredModels, isAnthropic, displayUrl } = require('../lib/model-list');

describe('displayUrl: the URL shown to the user', () => {
  test('drops user:password and the query, and ends with a slash', () => {
    assert.equal(displayUrl('http://u:p@10.0.0.5:11436/x?k=1'), 'http://10.0.0.5:11436/x/');
    assert.equal(displayUrl('http://127.0.0.1:8000'), 'http://127.0.0.1:8000/');
  });

  test('anything that is not an http(s) URL gives an empty string', () => {
    assert.equal(displayUrl('ftp://files.example.com/x'), '');
    assert.equal(displayUrl('not a url'), '');
    assert.equal(displayUrl(''), '');
  });
});

const MODEL_ENV = ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'];

/** A config whose env names are all set (empty unless given), so the machine's own environment does not leak in. */
function configWith(env = {}, model = '') {
  return { model, env: Object.fromEntries(MODEL_ENV.map(name => [name, env[name] ?? ''])) };
}

/** Serves the given JSON per path; a path not in the map answers 404. Returns { url, close }. */
function serve(routes) {
  const server = http.createServer((request, response) => {
    const body = routes[request.url.split('?')[0]];
    if (body === undefined) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise(done => { server.closeAllConnections(); server.close(done); }),
    }));
  });
}

describe('configuredModels and isAnthropic', () => {
  test('the configured models are the config model and the model env names, without duplicates or blanks', () => {
    const config = configWith({ ANTHROPIC_MODEL: 'm1', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'h1' }, 'm1');
    assert.deepEqual(configuredModels(config), ['m1', 'h1']);
  });

  test('only the Anthropic host counts as Anthropic (not a look-alike name)', () => {
    assert.equal(isAnthropic('https://api.anthropic.com/v1'), true);
    assert.equal(isAnthropic('https://anthropic.com'), true);
    assert.equal(isAnthropic('https://anthropic.com.evil.example'), false);
    assert.equal(isAnthropic('https://evilanthropic.com'), false);
    assert.equal(isAnthropic('http://localhost:11434'), false);
    assert.equal(isAnthropic('not a url'), false);
  });
});

describe('listModels with a model server', () => {
  test('the server list is used, embedding and rerank models are left out, and the first configured one is current', async () => {
    const server = await serve({ '/v1/models': { data: [{ id: 'qwen' }, { id: 'nomic-embed-text' }, { id: 'llama3' }] } });
    try {
      const result = await listModels(configWith({ ANTHROPIC_BASE_URL: server.url }, 'qwen'), { refresh: true });
      assert.equal(result.source, 'server');
      assert.deepEqual(result.models, [{ value: 'qwen', displayName: 'qwen' }, { value: 'llama3', displayName: 'llama3' }]);
      assert.equal(result.current, 'qwen');
      assert.equal(result.error, null);
    } finally {
      await server.close();
    }
  });

  test('an Ollama-style server with only /api/tags is read too', async () => {
    const server = await serve({ '/api/tags': { models: [{ name: 'llama3:8b' }] } });
    try {
      const result = await listModels(configWith({ ANTHROPIC_BASE_URL: server.url }), { refresh: true });
      assert.deepEqual(result.models, [{ value: 'llama3:8b', displayName: 'llama3:8b' }]);
      assert.equal(result.current, 'llama3:8b');
    } finally {
      await server.close();
    }
  });

  test('a configured model the server does not list is added, with a note that it comes from config.json', async () => {
    const server = await serve({ '/v1/models': { data: [] } });
    try {
      const result = await listModels(configWith({ ANTHROPIC_BASE_URL: server.url }, 'my-model'), { refresh: true });
      assert.deepEqual(result.models, [{ value: 'my-model', displayName: 'my-model', description: 'מוגדר ב-config.json' }]);
      assert.equal(result.current, 'my-model');
    } finally {
      await server.close();
    }
  });

  test('a server that cannot be reached and no configured model gives the CLI list and an error naming the server', async () => {
    const server = await serve({});
    const { url } = server;
    await server.close(); // the port is now closed
    const result = await listModels(configWith({ ANTHROPIC_BASE_URL: url }), { refresh: true });
    assert.equal(result.source, 'cli');
    assert.deepEqual(result.models, []);
    assert.equal(result.current, '');
    assert.ok(result.error.includes(url));
  });
});
