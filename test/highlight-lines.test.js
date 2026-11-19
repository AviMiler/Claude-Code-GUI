// Unit tests for syntax highlighting's pure parts: per-line splitting (public/js/highlight/code-lines.js) and the
// file-name -> language map (public/js/highlight/languages.js).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const lines = () => import('../public/js/highlight/code-lines.js');
const languages = () => import('../public/js/highlight/languages.js');

describe('splitHighlightedLines', () => {
  test('plain text splits on newlines, a trailing newline gives an empty last line', async () => {
    const { splitHighlightedLines } = await lines();
    assert.deepEqual(splitHighlightedLines('a\nb\n'), ['a', 'b', '']);
    assert.deepEqual(splitHighlightedLines(''), ['']);
  });

  test('a span open across a line break is closed and opened again', async () => {
    const { splitHighlightedLines } = await lines();
    const html = 'x <span class="hljs-comment">/* one\ntwo\nthree */</span> y';
    assert.deepEqual(splitHighlightedLines(html), [
      'x <span class="hljs-comment">/* one</span>',
      '<span class="hljs-comment">two</span>',
      '<span class="hljs-comment">three */</span> y',
    ]);
  });

  test('nested spans are carried in order', async () => {
    const { splitHighlightedLines } = await lines();
    const html = '<span class="hljs-string">`a<span class="hljs-subst">${b\nc}</span>d\n`</span>';
    assert.deepEqual(splitHighlightedLines(html), [
      '<span class="hljs-string">`a<span class="hljs-subst">${b</span></span>',
      '<span class="hljs-string"><span class="hljs-subst">c}</span>d</span>',
      '<span class="hljs-string">`</span>',
    ]);
  });

  test('escaped text is kept as it is and a stray close tag is dropped', async () => {
    const { splitHighlightedLines } = await lines();
    assert.deepEqual(splitHighlightedLines('&lt;b&gt;</span>\n&amp;'), ['&lt;b&gt;', '&amp;']);
  });

  test('the text of the lines is the text of the input', async () => {
    const { splitHighlightedLines } = await lines();
    const html = '<span class="a">1\n<span class="b">2\n3</span>\n4</span>\n5';
    const text = value => value.replace(/<[^>]+>/g, '');
    assert.equal(splitHighlightedLines(html).map(text).join('\n'), text(html));
  });
});

describe('languageForPath', () => {
  test('common extensions, case-insensitive, both separators', async () => {
    const { languageForPath } = await languages();
    assert.equal(languageForPath('/p/app.js'), 'javascript');
    assert.equal(languageForPath('C:\\p\\Main.TS'), 'typescript');
    assert.equal(languageForPath('x/y.py'), 'python');
    assert.equal(languageForPath('index.html'), 'xml');
    assert.equal(languageForPath('a.json'), 'json');
    assert.equal(languageForPath('style.css'), 'css');
  });

  test('Windows scripts and Dockerfiles', async () => {
    const { languageForPath } = await languages();
    assert.equal(languageForPath('C:\\x\\run.ps1'), 'powershell');
    assert.equal(languageForPath('mod.psm1'), 'powershell');
    assert.equal(languageForPath('build.bat'), 'dos');
    assert.equal(languageForPath('BUILD.CMD'), 'dos');
    assert.equal(languageForPath('/p/Dockerfile'), 'dockerfile');
    assert.equal(languageForPath('Dockerfile.dev'), 'dockerfile');
    assert.equal(languageForPath('api.dockerfile'), 'dockerfile');
    assert.equal(languageForPath('Makefile'), 'makefile');
  });

  test('plain text files stay plain, unknown files are unknown', async () => {
    const { languageForPath } = await languages();
    assert.equal(languageForPath('notes.txt'), 'plaintext');
    assert.equal(languageForPath('server.log'), 'plaintext');
    assert.equal(languageForPath('data.xyz'), '');
    assert.equal(languageForPath('LICENSE'), '');
    assert.equal(languageForPath('.bashrc'), '');
    assert.equal(languageForPath(''), '');
  });

  test('fenceLanguage takes the first word of the info string', async () => {
    const { fenceLanguage } = await languages();
    assert.equal(fenceLanguage(' JS title="a.js"'), 'js');
    assert.equal(fenceLanguage('{.python}'), 'python');
    assert.equal(fenceLanguage(''), '');
  });
});
