// Unit tests for lib/model-health.js. The "URL shown to the user" rule (displayUrl, not exported) is checked
// through checkModelServer's result. A throwaway HTTP server on 127.0.0.1 plays the model server; nothing leaves the machine.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { checkModelServer } = require('../lib/model-health');

/** Starts a local server; `respond(request, response)` answers. Returns { url, hits, close }. */
function serve(respond) {
  const hits = [];
  const server = http.createServer((request, response) => {
    hits.push(request.url);
    respond(request, response);
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port, hits,
        close: () => new Promise(done => { server.closeAllConnections(); server.close(done); }),
      });
    });
  });
}

const configFor = baseUrl => ({ model: '', env: { ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_AUTH_TOKEN: '', ANTHROPIC_API_KEY: '' } });
const ok = (request, response) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"data":[]}'); };

describe('checkModelServer: the URL shown to the user', () => {
  test('a server that answers 2xx is up; the shown URL has no credentials and no query, and ends with a slash', async () => {
    const server = await serve(ok);
    try {
      const result = await checkModelServer(configFor(`http://user:secret@127.0.0.1:${server.port}/proxy?token=abc`), { refresh: true });
      assert.equal(result.state, 'up');
      assert.equal(result.url, `http://127.0.0.1:${server.port}/proxy/`);
      assert.ok(!JSON.stringify(result).includes('secret'));
      assert.ok(!JSON.stringify(result).includes('token'));
      assert.deepEqual(server.hits, ['/proxy/v1/models']);
    } finally {
      await server.close();
    }
  });

  test('a base URL without a trailing slash still gets its /v1/models under the base path', async () => {
    const server = await serve(ok);
    try {
      const result = await checkModelServer(configFor(`http://127.0.0.1:${server.port}/base`), { refresh: true });
      assert.equal(result.url, `http://127.0.0.1:${server.port}/base/`);
      assert.deepEqual(server.hits, ['/base/v1/models']);
    } finally {
      await server.close();
    }
  });
});

describe('checkModelServer: states', () => {
  test('an HTTP error answer is down, with the status in the message', async () => {
    const server = await serve((request, response) => { response.writeHead(401); response.end(); });
    try {
      const result = await checkModelServer(configFor(`http://127.0.0.1:${server.port}/`), { refresh: true });
      assert.equal(result.state, 'down');
      assert.equal(result.error, 'השרת ענה HTTP 401');
      assert.equal(typeof result.latencyMs, 'number');
    } finally {
      await server.close();
    }
  });

  test('the cloud (or no base URL) is unknown and nothing is requested', async () => {
    const server = await serve(ok);
    try {
      const cloud = await checkModelServer(configFor('https://api.anthropic.com'), { refresh: true });
      assert.equal(cloud.state, 'unknown');
      assert.equal(cloud.url, '');
      const none = await checkModelServer({ model: '', env: { ANTHROPIC_BASE_URL: '' } }, { refresh: true });
      assert.equal(none.state, 'unknown');
      assert.equal(server.hits.length, 0);
    } finally {
      await server.close();
    }
  });

  test('a base URL that is not a URL is down, with no URL to show', async () => {
    const result = await checkModelServer(configFor('not a url'), { refresh: true });
    assert.equal(result.state, 'down');
    assert.equal(result.url, '');
  });

  test('a result is reused for 15 seconds unless a refresh is asked for', async () => {
    const server = await serve(ok);
    try {
      const config = configFor(`http://127.0.0.1:${server.port}/`);
      await checkModelServer(config, { refresh: true });
      await checkModelServer(config);
      assert.equal(server.hits.length, 1);
    } finally {
      await server.close();
    }
  });
});
