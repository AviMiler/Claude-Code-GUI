const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-route-test-'));
process.env.CLAUDE_GUI_DATA = path.join(scratch, 'data');
process.env.CLAUDE_GUI_CONFIG = path.join(scratch, 'config.json');
const store = require('../lib/session-store');
const { servePreview, isPreviewPath } = require('../lib/preview/preview-routes');
const { previewPolicy } = require('../lib/preview/preview-headers');

const project = path.join(scratch, 'project');
const outside = path.join(scratch, 'outside');
for (const dir of [project, outside, path.join(project, '.git'), path.join(project, '.claude'), path.join(project, 'sub'), process.env.CLAUDE_GUI_DATA]) fs.mkdirSync(dir, { recursive: true });
const files = { 'index.html': '<p>hi</p>', 'sub/style.css': 'p{}', 'app.js': '1', 'pic.png': 'png', 'pic.svg': '<svg/>', 'doc.pdf': '%PDF', 'notes.txt': 'x',
  'data.json': '{}', 'noext': 'x', '.git/x.html': 'x', '.claude/x.html': 'x', '.mcp.json': '{}', 'a b#c.html': 'space' };
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(project, name), text);
fs.writeFileSync(path.join(outside, 'secret.html'), 'secret');
fs.writeFileSync(path.join(process.env.CLAUDE_GUI_DATA, 'x.html'), 'data');
const session = store.create({ name: 'p', cwd: project, mode: 'default' });
const wide = store.create({ name: 'w', cwd: scratch, mode: 'default' }); // its folder holds the GUI's data folder
const gui = store.create({ name: 'g', cwd: path.resolve(__dirname, '..'), mode: 'default' });

let port;
const server = http.createServer((request, response) => servePreview(request, response, new URL(request.url, 'http://x').pathname));
test.before(() => new Promise(resolve => server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(); })));
test.after(() => server.close());

/** A raw request (the path is sent as written, without the URL parser folding ".."). */
function get(rawPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path: rawPath, headers: { host: `127.0.0.1:${port}` } }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
    request.end();
  });
}
const url = (rel, id = session.id, root = 0) => `/api/sessions/${id}/preview/${root}/${rel}`;

function assertSandboxed(response, label) {
  const csp = response.headers['content-security-policy'] || '';
  assert.match(csp, /(^|; )sandbox allow-scripts(;|$)/, label);
  assert.ok(!/allow-same-origin|allow-top-navigation|allow-popups|allow-forms|allow-modals/.test(csp), label);
  assert.match(csp, /connect-src 'none'/, label);
  assert.match(csp, /form-action 'none'/, label);
  assert.match(csp, /frame-src 'none'/, label);
  assert.ok(!csp.includes("'self'") || csp.includes("frame-ancestors 'self'"), label);
  assert.equal(response.headers['x-content-type-options'], 'nosniff', label);
}

test('allowed static types are served with their own type and the sandbox headers', async () => {
  const expected = { 'index.html': 'text/html; charset=utf-8', 'sub/style.css': 'text/css; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8',
    'pic.png': 'image/png', 'pic.svg': 'image/svg+xml', 'doc.pdf': 'application/pdf', 'a%20b%23c.html': 'text/html; charset=utf-8' };
  for (const [rel, type] of Object.entries(expected)) {
    const response = await get(url(rel));
    assert.equal(response.status, 200, rel);
    assert.equal(response.headers['content-type'], type, rel);
    assertSandboxed(response, rel);
  }
  assert.equal((await get(url('doc.pdf'))).headers['content-disposition'], 'inline');
  assert.equal((await get(url('index.html'))).body, '<p>hi</p>');
  const head = await get(url('index.html'), 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
});

test('types outside the allow-list are refused, with the headers', async () => {
  for (const rel of ['notes.txt', 'data.json', 'noext', '.mcp.json']) {
    const response = await get(url(rel));
    assert.ok([403, 415].includes(response.status), `${rel} -> ${response.status}`);
    assertSandboxed(response, rel);
    assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
  }
});

test('traversal, absolute paths, NUL, streams and unknown roots are refused', async () => {
  const cases = {
    '../outside/secret.html': 403, '%2e%2e/outside/secret.html': 403, '..%2Foutside%2Fsecret.html': 403, 'sub/../../outside/secret.html': 403,
    [encodeURIComponent(path.join(outside, 'secret.html'))]: 400, '%2Fetc%2Fpasswd.html': 400, 'index.html%00.png': 400, 'index.html::$DATA': 400,
    'missing.html': 404, 'sub': 415,
  };
  if (process.platform === 'win32') cases['..%5Coutside%5Csecret.html'] = 403;
  for (const [rel, status] of Object.entries(cases)) {
    const response = await get(url(rel));
    // A literal or %2e ".." is folded by the URL parser out of the route (404); one hidden in an encoded separator reaches safe-path (403)
    if (status === 403) assert.ok([403, 404].includes(response.status), `${rel} -> ${response.status}`);
    else assert.equal(response.status, status, rel);
    assert.notEqual(response.body, 'secret', rel);
    assertSandboxed(response, rel);
  }
  assert.equal((await get(url('..%2Foutside%2Fsecret.html'))).status, 403, 'an encoded separator reaches the real-path check');
  assert.equal((await get(url('index.html', session.id, 7))).status, 404);
  assert.equal((await get(url('index.html', 'no-such-session'))).status, 404);
});

test('.git, .claude, the GUI data folder and the GUI code are never served', async () => {
  for (const [rel, id] of [['.git/x.html', session.id], ['.claude/x.html', session.id], ['data/x.html', wide.id], ['public/index.html', gui.id]]) {
    const response = await get(url(rel, id));
    assert.equal(response.status, 403, rel);
    assertSandboxed(response, rel);
  }
});

test('a symlink out of the folder is refused', async t => {
  const link = path.join(project, 'link.html');
  try { fs.symlinkSync(path.join(outside, 'secret.html'), link); } catch { return t.skip('symlinks not available'); }
  try { assert.equal((await get(url('link.html'))).status, 403); } finally { fs.unlinkSync(link); }
});

test('other methods and malformed preview URLs still get the headers', async () => {
  for (const [rawPath, method, status] of [[url('index.html'), 'POST', 405], [url('index.html'), 'DELETE', 405],
    [`/api/sessions/${session.id}/preview/`, 'GET', 404], [`/api/sessions/${session.id}/preview/x/index.html`, 'GET', 404]]) {
    const response = await get(rawPath, method);
    assert.equal(response.status, status, `${method} ${rawPath}`);
    assertSandboxed(response, rawPath);
  }
  assert.ok(isPreviewPath(`/api/sessions/${session.id}/preview`));
  assert.ok(!isPreviewPath(`/api/sessions/${session.id}/previewx`));
});

test('other API routes refuse to load into a frame; the preview route and plain requests are untouched', () => {
  const { isFramedApiRequest } = require('../lib/preview/preview-routes');
  const asDest = dest => ({ headers: dest ? { 'sec-fetch-dest': dest } : {} });
  for (const dest of ['iframe', 'frame', 'embed', 'object']) assert.ok(isFramedApiRequest(asDest(dest), '/api/catalog'), dest);
  for (const dest of ['empty', 'document', 'image', 'script', null]) assert.ok(!isFramedApiRequest(asDest(dest), '/api/state'), String(dest));
  assert.ok(!isFramedApiRequest(asDest('iframe'), url('index.html')));
});

test('subresources are limited to the session preview prefix, not the whole origin', () => {
  const policy = previewPolicy('127.0.0.1:3784', 'abc');
  for (const directive of ['img-src', 'style-src', 'script-src', 'media-src']) {
    assert.match(policy, new RegExp(`${directive} http://127\\.0\\.0\\.1:3784/api/sessions/abc/preview/( |;|$)`));
  }
  assert.match(previewPolicy(null, null), /img-src 'none'/);
});
