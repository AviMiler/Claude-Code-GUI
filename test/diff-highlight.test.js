// Tests the Changes pane's diff colours and side-by-side layout, pure parts: the two texts of a hunk and the mapping back
// to rows (public/js/panes/diff-highlight.js), the pairing of deleted and added lines (diff-split.js), that a coloured row
// still reads as the same text, and the contrast of the token colours on the added/removed row backgrounds.
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hl = () => import('../public/js/panes/diff-highlight.js');
const split = () => import('../public/js/panes/diff-split.js');
const parse = () => import('../public/js/panes/diff-parse.js');

const DIFF = [
  'diff --git a/a.js b/a.js', '--- a/a.js', '+++ b/a.js', '@@ -1,5 +1,5 @@',
  ' const a = 1;', '-let /* old', '-still comment */ b = 2;', '+let c = "new";', '+let d = 3;', ' tail();', '',
].join('\n');
const plainText = html => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

describe('hunk sides', () => {
  test('new side = context + added, old side = deleted, with their indexes', async () => {
    const { sideTexts } = await hl();
    const { parseDiff } = await parse();
    const { next, prev } = sideTexts(parseDiff(DIFF)[0].hunks[0]);
    assert.deepEqual(next.lines, ['const a = 1;', 'let c = "new";', 'let d = 3;', 'tail();']);
    assert.deepEqual(next.at, [0, 3, 4, 5]);
    assert.deepEqual(prev.lines, ['let /* old', 'still comment */ b = 2;']);
    assert.deepEqual(prev.at, [1, 2]);
  });

  test('mapToRows puts each side back on its rows and leaves a plain side null', async () => {
    const { mapToRows } = await hl();
    const next = { at: [0, 2] };
    const prev = { at: [1] };
    assert.deepEqual(mapToRows(3, next, prev, ['n0', 'n1'], ['p0']), ['n0', 'p0', 'n1']);
    assert.deepEqual(mapToRows(3, next, prev, ['n0', 'n1'], null), ['n0', null, 'n1']);
    assert.deepEqual(mapToRows(2, next, prev, null, null), [null, null]);
  });
});

describe('highlightHunk with the vendored highlight.js', () => {
  before(() => {
    globalThis.hljs = require(path.join(__dirname, '..', 'public', 'vendor', 'highlight', 'highlight.min.js'));
  });

  test('every row keeps its text; the old side colours a comment that spans two deleted lines', async () => {
    const { highlightHunk } = await hl();
    const { parseDiff } = await parse();
    const hunk = parseDiff(DIFF)[0].hunks[0];
    const rows = highlightHunk(hunk, 'src/a.js');
    assert.equal(rows.length, hunk.lines.length);
    hunk.lines.forEach((line, i) => assert.equal(plainText(rows[i]), line.text)); // what the quote reader sees
    assert.match(rows[0], /hljs-keyword/);
    assert.match(rows[1], /hljs-comment/);
    assert.match(rows[2], /hljs-comment/);
    assert.match(rows[3], /hljs-string/);
  });

  test('HTML in the code stays escaped and an unknown file type stays plain', async () => {
    const { highlightHunk } = await hl();
    const { parseDiff } = await parse();
    const text = 'diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-<b>x</b>\n+let s = "<img onerror=1>";\n';
    const hunk = parseDiff(text)[0].hunks[0];
    const rows = highlightHunk(hunk, 'x.js');
    assert.ok(!rows.join('').includes('<img'));
    assert.equal(plainText(rows[1]), 'let s = "<img onerror=1>";');
    assert.deepEqual(highlightHunk(hunk, 'notes.unknownext'), [null, null]);
    assert.deepEqual(highlightHunk(hunk, 'notes.txt'), [null, null]);
  });

  test('setCode appends text or the highlighted HTML after the sign', async () => {
    const { setCode } = await hl();
    const calls = [];
    const cell = { append: text => calls.push(['text', text]), insertAdjacentHTML: (where, html) => calls.push([where, html]) };
    setCode(cell, 'a < b', null);
    setCode(cell, 'a', '<span class="x">a</span>');
    assert.deepEqual(calls, [['text', 'a < b'], ['beforeend', '<span class="x">a</span>']]);
  });
});

describe('without highlight.js', () => {
  test('rows stay plain', async () => {
    const saved = globalThis.hljs;
    delete globalThis.hljs;
    try {
      const { highlightHunk } = await hl();
      const { parseDiff } = await parse();
      const hunk = parseDiff(DIFF.replace('let /* old', 'let /* older').replace('const a = 1;', 'const zz = 1;'))[0].hunks[0];
      assert.ok(highlightHunk(hunk, 'b.js').every(row => row === null));
    } finally { globalThis.hljs = saved; }
  });
});

describe('pairLines (side by side)', () => {
  const lines = types => types.map(type => ({ type }));

  test('context is on both sides; a deleted and an added run are paired top to bottom', async () => {
    const { pairLines } = await split();
    assert.deepEqual(pairLines(lines(['ctx', 'del', 'del', 'add', 'ctx'])), [
      { old: 0, new: 0 }, { old: 1, new: 3 }, { old: 2, new: null }, { old: 4, new: 4 }]);
  });

  test('a longer added run leaves empty cells on the old side; add-only and delete-only blocks', async () => {
    const { pairLines } = await split();
    assert.deepEqual(pairLines(lines(['del', 'add', 'add', 'add'])), [{ old: 0, new: 1 }, { old: null, new: 2 }, { old: null, new: 3 }]);
    assert.deepEqual(pairLines(lines(['add'])), [{ old: null, new: 0 }]);
    assert.deepEqual(pairLines(lines(['del', 'del'])), [{ old: 0, new: null }, { old: 1, new: null }]);
    assert.deepEqual(pairLines([]), []);
  });

  test('an interleaved run (del add del add) pairs by order within the run', async () => {
    const { pairLines } = await split();
    assert.deepEqual(pairLines(lines(['del', 'add', 'del', 'add'])), [{ old: 0, new: 1 }, { old: 2, new: 3 }]);
  });

  test('every line of a hunk appears exactly once', async () => {
    const { pairLines } = await split();
    const { parseDiff } = await parse();
    const hunk = parseDiff(DIFF)[0].hunks[0];
    const seen = hunk.lines.map(() => 0);
    for (const row of pairLines(hunk.lines)) { if (row.old !== null) seen[row.old]++; if (row.new !== null && row.new !== row.old) seen[row.new]++; }
    assert.deepEqual(seen, hunk.lines.map(() => 1));
  });
});

describe('token colour contrast on diff rows', () => {
  const css = file => fs.readFileSync(path.join(__dirname, '..', 'public', 'css', file), 'utf8');
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const light = channel => { const v = channel / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = c => 0.2126 * light(c[0]) + 0.7152 * light(c[1]) + 0.0722 * light(c[2]);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const mix = (base, tint, share) => base.map((v, i) => v * (1 - share) + tint[i] * share);
  const vars = (text, selector) => {
    const block = text.slice(text.indexOf(selector));
    return Object.fromEntries([...block.slice(0, block.indexOf('}')).matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));
  };

  for (const [theme, selector] of [['light', ':root {'], ['dark', ':root[data-theme="dark"]']]) {
    test(`${theme}: every token colour is at least 4.5:1 on added and removed rows`, () => {
      const tokens = vars(css('highlight.css'), selector);
      const base = vars(css('tokens.css'), selector);
      const surface = rgb(base.surface);
      const backgrounds = [mix(surface, rgb(base.success), 0.12), mix(surface, rgb(base.danger), 0.10)]; // changes-pane.css .diff-row.add / .del
      const names = Object.keys(tokens).filter(name => name.startsWith('hl-'));
      assert.ok(names.length >= 9);
      for (const name of names) for (const background of backgrounds) assert.ok(ratio(rgb(tokens[name]), background) >= 4.5, `${theme} ${name}`);
    });
  }
});
