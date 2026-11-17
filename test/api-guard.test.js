const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'api-guard-test-'));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
const store = require('../lib/session-store');
const { handleApi } = require('../lib/api-routes');
const { serveStatic } = require('../lib/static-files');
const { isAllowedRequest, sendJson } = require('../lib/http-utils');
const { servePreview } = require('../lib/preview/preview-routes');

const home = path.join(scratch, 'home');
const foreign = path.join(scratch, 'foreign');
const picked = path.join(scratch, 'picked');
const project = path.join(scratch, 'project');
for (const dir of [home, foreign, picked, project]) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(project, 'index.html'), '<p>hi</p>');
const config = { defaultCwd: home, claudePath: 'claude' };
const session = store.create({ name: 'p', cwd: project, mode: 'default' });

let port;
const server = http.createServer(async (request, response) => {
  try {
    if (!isAllowedRequest(request, port)) return sendJson(response, 403, { error: 'forbidden' });
    if (request.url.startsWith('/api/')) return await handleApi(request, response, config);
    serveStatic(request, response);
  } catch (error) { sendJson(response, error.status || 500, { error: error.message }); }
});
test.before(() => new Promise(resolve => server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(); })));
test.after(() => { server.closeAllConnections(); server.close(); });

function call(path_, { header = true, method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const sent = { host: `127.0.0.1:${port}`, ...(header && { 'x-claude-gui': '1' }), ...headers };
    const request = http.request({ host: '127.0.0.1', port, method, path: path_, headers: sent }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
    request.end();
  });
}
const q = value => encodeURIComponent(value);

test('a GET without the custom header is refused, with it the route works', async () => {
  assert.equal((await call('/api/folders', { header: false })).status, 403);
  assert.equal((await call('/api/git', { header: false })).status, 403);
  assert.equal((await call('/api/folders', { method: 'POST', header: false })).status, 403);
  const ok = await call(`/api/folders?path=${q(home)}`);
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(ok.body).path, home);
});

test('exempt routes work without the header: images, uploads (their own 404 for an unknown id), the event stream', async () => {
  assert.equal((await call('/api/images/nothere.png', { header: false })).status, 404);
  assert.equal((await call('/api/uploads/nothere/a.txt', { header: false })).status, 404);
  const stream = await new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/api/events', headers: { host: `127.0.0.1:${port}` } }, response => {
      resolve({ status: response.statusCode, type: response.headers['content-type'] });
      request.destroy();
    });
    request.on('error', error => (error.code === 'ECONNRESET' ? null : reject(error)));
  });
  assert.equal(stream.status, 200);
  assert.match(stream.type, /text\/event-stream/);
});

test('the preview route needs no header (it is a navigation) and stays frameable by its own origin only', async () => {
  const response = await new Promise((resolve, reject) => {
    const preview = http.createServer((request, answer) => servePreview(request, answer, new URL(request.url, 'http://x').pathname));
    preview.listen(0, '127.0.0.1', () => {
      const address = preview.address().port;
      http.get({ host: '127.0.0.1', port: address, path: `/api/sessions/${session.id}/preview/0/index.html`, headers: { host: `127.0.0.1:${address}` } }, answerResponse => {
        resolve({ status: answerResponse.statusCode, headers: answerResponse.headers });
        answerResponse.resume();
        preview.close();
      }).on('error', reject);
    });
  });
  assert.equal(response.status, 200);
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'self'/);
  assert.equal(response.headers['x-frame-options'], undefined);
});

test('a GET with a folder in the URL: a foreign folder is refused, known ones are accepted', async () => {
  for (const route of ['git', 'catalog', 'files', 'claude-files', 'transcripts']) {
    const refused = await call(`/api/${route}?cwd=${q(foreign)}`);
    assert.equal(refused.status, 403, route);
  }
  assert.equal((await call(`/api/git?cwd=${q(path.join(scratch, 'missing'))}`)).status, 400);
  assert.equal((await call(`/api/git?cwd=${q(home)}`)).status, 200); // the default folder
  assert.equal((await call(`/api/git?cwd=${q(project)}`)).status, 200); // a session's folder
  assert.equal((await call(`/api/git?cwd=${q(picked)}`)).status, 403);
  await call(`/api/folders?path=${q(picked)}`); // the folder picker lists it
  assert.equal((await call(`/api/git?cwd=${q(picked)}`)).status, 200);
  await call('/api/worktree/probe', { method: 'POST' }); // no body, default folder: nothing new to remember, still fine
  assert.equal((await call(`/api/git?sessionId=${session.id}`)).status, 200);
});

test('the GUI answers carry anti-framing headers', async () => {
  const json = await call(`/api/folders?path=${q(home)}`);
  const refusal = await call('/api/folders', { header: false });
  const page = await call('/', { header: false });
  for (const answer of [json, refusal, page]) {
    assert.equal(answer.headers['content-security-policy'], "frame-ancestors 'none'");
    assert.equal(answer.headers['x-frame-options'], 'DENY');
  }
  assert.equal(page.status, 200);
});
