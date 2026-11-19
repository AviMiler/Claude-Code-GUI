// Tests syntax highlighting with the vendored highlight.js (public/vendor/highlight/) loaded as the browser would:
// the wrapper (public/js/highlight/highlight.js) and the Markdown renderer's code blocks (public/js/markdown.js).
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const vendor = path.join(__dirname, '..', 'public', 'vendor', 'highlight');
const stripTags = html => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

before(() => {
  globalThis.hljs = require(path.join(vendor, 'highlight.min.js'));
  for (const name of ['powershell', 'dos', 'dockerfile']) require(path.join(vendor, 'languages', `${name}.min.js`)); // register on the global
});
const wrapper = () => import('../public/js/highlight/highlight.js');
const markdown = () => import('../public/js/markdown.js');

describe('highlightHtml', () => {
  test('colours a known language and escapes the text', async () => {
    const { highlightHtml } = await wrapper();
    const html = highlightHtml('const a = "<script>";', 'js');
    assert.match(html, /<span class="hljs-keyword">const<\/span>/);
    assert.ok(!html.includes('<script>'));
    assert.equal(stripTags(html), 'const a = "<script>";');
  });

  test('the vendored extra languages are registered', async () => {
    const { highlightHtml } = await wrapper();
    assert.match(highlightHtml('Get-ChildItem -Path $x', 'powershell'), /hljs-/);
    assert.match(highlightHtml('@echo off\nset X=1', 'dos'), /hljs-/);
    assert.match(highlightHtml('FROM node:22\nRUN npm ci', 'dockerfile'), /hljs-keyword/);
  });

  test('plaintext, an unknown language, oversized text and auto-detection above 20 KB stay plain', async () => {
    const { highlightHtml } = await wrapper();
    assert.equal(highlightHtml('const a = 1', 'plaintext'), null);
    assert.equal(highlightHtml('x'.repeat(200 * 1024 + 1), 'js'), null);
    assert.equal(highlightHtml('let a = 1;\n'.repeat(2100), ''), null);
    assert.equal(highlightHtml('def f():\n  return 1', 'no-such-language'), null); // "console", "output": never guessed
    assert.equal(typeof highlightHtml('def f():\n  return 1', ''), 'string'); // no language, small: guessed
  });

  test('highlightLines keeps one entry per line', async () => {
    const { highlightLines } = await wrapper();
    const source = ['/* a', 'b */', 'const x = `1', '2`;'];
    const result = highlightLines(source, 'javascript');
    assert.equal(result.length, 4);
    assert.deepEqual(result.map(stripTags), source);
  });
});

describe('Markdown code blocks', () => {
  test('a closed fence is coloured, the copy text stays the raw code', async () => {
    const { renderMarkdown } = await markdown();
    const html = renderMarkdown('x\n\n```js\nif (a < b) return "&";\n```\n');
    assert.match(html, /<code class="hljs"><span class="hljs-keyword">if<\/span>/);
    assert.equal(stripTags(html.match(/<code class="hljs">([\s\S]*?)<\/code><\/pre>/)[1]), 'if (a < b) return "&";');
  });

  test('a fence still streaming is not coloured', async () => {
    const { renderMarkdown } = await markdown();
    const html = renderMarkdown('```js\nconst a = 1;');
    assert.match(html, /<pre dir="ltr"><code>const a = 1;<\/code>/);
  });
});
