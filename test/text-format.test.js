// Unit tests for lib/files/text-format.js: decode (BOM, line endings, binary and encoding checks) and encode (the way back).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { decode, encode } = require('../lib/files/text-format');

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

describe('decode: what the editor gets', () => {
  test('an LF file comes back as it is, with no BOM and no read-only reason', () => {
    assert.deepEqual(decode(Buffer.from('one\ntwo\n')), { content: 'one\ntwo\n', eol: 'lf', bom: false, readOnlyReason: null });
  });

  test('an empty file is an empty text with LF endings', () => {
    assert.deepEqual(decode(Buffer.alloc(0)), { content: '', eol: 'lf', bom: false, readOnlyReason: null });
  });

  test('a CRLF file is edited as LF text, and the CRLF ending is remembered', () => {
    const result = decode(Buffer.from('a\r\nb\r\n'));
    assert.equal(result.content, 'a\nb\n');
    assert.equal(result.eol, 'crlf');
    assert.equal(result.readOnlyReason, null);
  });

  test('a UTF-8 BOM is recognized and removed from the text', () => {
    const result = decode(Buffer.concat([BOM, Buffer.from('שלום\n')]));
    assert.equal(result.bom, true);
    assert.equal(result.content, 'שלום\n');
  });

  test('a file with mixed line endings is read-only: saving would rewrite every line', () => {
    const result = decode(Buffer.from('a\r\nb\nc\r\n'));
    assert.match(result.readOnlyReason, /סוגי סוף שורה מעורבים/);
    assert.equal(result.eol, 'crlf'); // the majority
    assert.equal(result.content, 'a\r\nb\nc\r\n'); // kept as it is
  });

  test('a lone carriage return also counts as mixed endings', () => {
    assert.notEqual(decode(Buffer.from('a\rb')).readOnlyReason, null);
  });
});

describe('decode: refused files', () => {
  test('a file with a NUL byte is binary and gives a 415', () => {
    assert.throws(() => decode(Buffer.from([0x61, 0x00, 0x62])), error => error.status === 415 && error.message === 'קובץ בינארי – אין עריכת טקסט');
  });

  test('text that is not UTF-8 gives a 415 and is not edited here', () => {
    assert.throws(() => decode(Buffer.from([0x61, 0xff, 0xfe])), error => error.status === 415
      && error.message === 'הקובץ אינו UTF-8, ולכן לא נערך כאן');
  });
});

describe('encode: the file as it was, with the edit applied', () => {
  test('CRLF endings are put back on save, so a save of an unchanged file changes no byte', () => {
    const original = Buffer.from('a\r\nb\r\n');
    const { content, eol, bom } = decode(original);
    assert.deepEqual(encode(content, eol, bom), original);
  });

  test('a BOM is written back in front of the text', () => {
    const original = Buffer.concat([BOM, Buffer.from('x\ny\n')]);
    const { content, eol, bom } = decode(original);
    assert.deepEqual(encode(content, eol, bom), original);
  });

  test('an LF file with an edit is written with LF endings only', () => {
    assert.deepEqual(encode('new\nline\n', 'lf', false), Buffer.from('new\nline\n'));
  });
});
