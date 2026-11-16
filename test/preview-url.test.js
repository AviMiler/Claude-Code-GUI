const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'preview', 'preview-url.js'));
const load = () => import(`data:text/javascript;base64,${source.toString('base64')}`); // the browser module itself

const OWN = '3784';

test('local addresses on another port are accepted and normalized', async () => {
  const { checkLocalUrl } = await load();
  const cases = {
    'http://localhost:3000': 'http://localhost:3000/',
    'http://127.0.0.1:5173/app?x=1#top': 'http://127.0.0.1:5173/app?x=1#top',
    'http://[::1]:8080/': 'http://[::1]:8080/',
    'HTTP://LOCALHOST:3000/Page': 'http://localhost:3000/Page',
    'https://localhost:8443': 'https://localhost:8443/',
    'http://localhost': 'http://localhost/',
    '  http://localhost:3000  ': 'http://localhost:3000/',
    'http://localhost:03000': 'http://localhost:3000/',
  };
  for (const [input, expected] of Object.entries(cases)) assert.deepEqual(checkLocalUrl(input, OWN), { url: expected }, input);
});

test('the GUI own origin is refused in every spelling', async () => {
  const { checkLocalUrl } = await load();
  for (const input of [`http://localhost:${OWN}`, `http://127.0.0.1:${OWN}/`, `http://[::1]:${OWN}/api/state`, `https://localhost:${OWN}`,
    `HTTP://LocalHost:${OWN}`, `http://localhost:0${OWN}`, `http://127.0.0.1:${OWN}/x/../api/state`]) {
    assert.ok(checkLocalUrl(input, OWN).error, input);
  }
  assert.ok(checkLocalUrl('http://localhost/', '80').error, 'default port equal to the GUI port');
  assert.ok(checkLocalUrl('https://localhost/', '443').error);
});

test('other hosts, odd spellings, credentials and other schemes are refused', async () => {
  const { checkLocalUrl } = await load();
  for (const input of [
    'http://example.com', 'http://localhost.evil.com:3000', 'http://evil.com/localhost', 'http://localhost.:3000', 'http://127.0.0.1.:3000',
    'http://2130706433:3000', 'http://0x7f.1:3000', 'http://0x7f000001:3000', 'http://127.1:3000', 'http://0177.0.0.1:3000', 'http://127.0.0.2:3000',
    'http://0.0.0.0:3000', 'http://[0:0:0:0:0:0:0:1]:3000', 'http://[::ffff:127.0.0.1]:3000', 'http://[::1%25lo]:3000',
    'http://user:pass@localhost:3000', 'http://user@localhost:3000', 'http://localhost:3000@evil.com', 'http://evil.com@localhost:3000',
    'http://localhost:0', 'http://localhost:99999', 'http://localhost:-1', 'http://localhost:3000x',
    'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>1</script>', 'file:///C:/x.html', 'ftp://localhost:21', 'ws://localhost:3000',
    'blob:http://localhost:3000/x', '//localhost:3000', 'localhost:3000', 'http:/localhost:3000', 'http:\\\\localhost:3000', 'http://local\nhost:3000',
    'http://localhost\t:3000', 'http://loc%61lhost:3000', '', '   ', null, undefined,
  ]) {
    const result = checkLocalUrl(input, OWN);
    assert.ok(result.error && !result.url, String(input));
  }
});

test('previewKind and previewSrc', async () => {
  const { previewKind, previewSrc } = await load();
  assert.equal(previewKind('C:\\p\\Index.HTML'), 'html');
  assert.equal(previewKind('a.svg'), 'image');
  assert.equal(previewKind('a.pdf'), 'pdf');
  assert.equal(previewKind('a.md'), null);
  assert.equal(previewKind('a.html.txt'), null);
  const session = { id: 's1', cwd: 'C:\\Proj', addDirs: ['D:\\extra'] };
  assert.equal(previewSrc(session, 'C:\\proj\\site\\a b#.html'), '/api/sessions/s1/preview/0/site/a%20b%23.html');
  assert.equal(previewSrc(session, 'D:\\extra\\x.png'), '/api/sessions/s1/preview/1/x.png');
  assert.equal(previewSrc(session, 'site/index.html'), '/api/sessions/s1/preview/0/site/index.html');
  assert.equal(previewSrc(session, 'C:\\Projx\\a.html'), null);
  assert.equal(previewSrc(session, 'E:\\a.html'), null);
  assert.equal(previewSrc(session, '../a.html'), null);
});
