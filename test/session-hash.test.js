// Unit tests for the per-session link (public/js/sync/session-hash.js, DOM-free): building it and reading its hash.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../public/js/sync/session-hash.js');

describe('sessionFromHash', () => {
  test('reads the id of #session=<id>, decoded', async () => {
    const { sessionFromHash } = await load();
    assert.equal(sessionFromHash('#session=abc-123'), 'abc-123');
    assert.equal(sessionFromHash('#session=a%2Fb%20c'), 'a/b c');
  });

  test('another hash, an empty id or a broken escape names no session', async () => {
    const { sessionFromHash } = await load();
    for (const hash of ['', '#', '#other=1', '#session=', '#session=%E0%A4%A', 'session=abc', undefined]) {
      assert.equal(sessionFromHash(hash), null, String(hash));
    }
  });

  test('isSessionHash tells a session link even when its id cannot be read', async () => {
    const { isSessionHash } = await load();
    assert.equal(isSessionHash('#session=%E0%A4%A'), true);
    assert.equal(isSessionHash('#other'), false);
  });
});

describe('sessionLink', () => {
  test('the page address with the id encoded, and it reads back', async () => {
    const { sessionLink, sessionFromHash } = await load();
    const link = sessionLink({ origin: 'http://127.0.0.1:3737', pathname: '/' }, 'a b/#c');
    assert.equal(link, 'http://127.0.0.1:3737/#session=a%20b%2F%23c');
    assert.equal(sessionFromHash(new URL(link).hash), 'a b/#c');
  });
});
