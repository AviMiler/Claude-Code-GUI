// Unit tests for the "הוספה לצ'אט" quote text (public/js/quote/quote-format.js): pure functions, no DOM.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../public/js/quote/quote-format.js');

describe('quote format', () => {
  test('plain text becomes > lines, an empty line a bare >', async () => {
    const { formatQuote } = await load();
    assert.equal(formatQuote({ text: 'שלום\n\nעולם' }), '> שלום\n>\n> עולם');
  });

  test('a file quote has a header with the path and the line range', async () => {
    const { formatQuote } = await load();
    assert.equal(formatQuote({ text: 'a\nb', path: 'C:\\repo\\x.js', from: 12, to: 13 }), 'C:\\repo\\x.js:12-13\n> a\n> b');
    assert.equal(formatQuote({ text: 'a', path: 'src/x.js', from: 7, to: 7 }), 'src/x.js:7\n> a');
    assert.equal(formatQuote({ text: 'a', path: 'src/x.js' }), 'src/x.js\n> a');
    assert.equal(formatQuote({ text: 'a', path: 'x.js', from: 3, to: 3, note: '(שורות שנמחקו)' }), 'x.js:3 (שורות שנמחקו)\n> a');
  });

  test('blank lines around the selection are dropped and the range follows', async () => {
    const { formatQuote } = await load();
    assert.equal(formatQuote({ text: '\n\r\na\r\nb\n\n', path: 'x.js', from: 4, to: 9 }), 'x.js:6-7\n> a\n> b');
    assert.equal(formatQuote({ text: ' \n\n' }), '');
  });

  test('appendQuote replaces an empty box and appends after a blank line', async () => {
    const { appendQuote } = await load();
    assert.equal(appendQuote('', '> q'), '> q');
    assert.equal(appendQuote('  \n', '> q'), '> q');
    assert.equal(appendQuote('look at this\n', '> q'), 'look at this\n\n> q');
  });

  test('lineRange counts lines before and inside a text-area selection', async () => {
    const { lineRange } = await load();
    const text = 'one\ntwo\nthree\nfour';
    assert.deepEqual(lineRange(text, 4, 7), { from: 2, to: 2 });
    assert.deepEqual(lineRange(text, 4, 13), { from: 2, to: 3 });
    assert.deepEqual(lineRange(text, 4, 8), { from: 2, to: 2 }); // ends right after the newline: not line 3
    assert.deepEqual(lineRange(text, 0, text.length), { from: 1, to: 4 });
  });

  test('joinRows joins row texts and takes the smallest and largest line', async () => {
    const { joinRows } = await load();
    assert.deepEqual(joinRows([{ line: 5, text: 'a' }, { line: 6, text: 'b' }]), { text: 'a\nb', from: 5, to: 6 });
    assert.deepEqual(joinRows([{ line: null, text: 'a' }]), { text: 'a', from: null, to: null });
  });

  test('the size cap is 20000 characters', async () => {
    assert.equal((await load()).QUOTE_LIMIT, 20000);
  });
});
