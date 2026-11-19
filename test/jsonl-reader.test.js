// Unit tests for lib/transcripts/jsonl-reader.js: reading a CLI .jsonl file, including one that is still being written.
// Each test uses its own file in a temp folder (the reader keeps a module-level cache keyed by the file path).
const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readLines, parseLines } = require('../lib/transcripts/jsonl-reader');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const fileNamed = name => path.join(dir, `${name}.jsonl`);
const ns = lines => lines.map(line => line.n);

describe('parseLines', () => {
  test('skips blank lines and lines that are not JSON', () => {
    assert.deepEqual(parseLines('{"a":1}\nnot json\n\n{"b":2}'), [{ a: 1 }, { b: 2 }]);
  });
});

describe('readLines: a file that grows', () => {
  test('a line appended after a read shows up in the next read, once', () => {
    const file = fileNamed('grows');
    fs.writeFileSync(file, '{"n":1}\n{"n":2}\n');
    assert.deepEqual(ns(readLines(file)), [1, 2]);
    fs.appendFileSync(file, '{"n":3}\n');
    assert.deepEqual(ns(readLines(file)), [1, 2, 3]);
    assert.deepEqual(ns(readLines(file)), [1, 2, 3]);
  });

  test('a last line with no newline yet is shown, and completed once its newline arrives', () => {
    const file = fileNamed('no-newline');
    fs.writeFileSync(file, '{"n":1}\n{"n":2}');
    assert.deepEqual(ns(readLines(file)), [1, 2]);
    fs.appendFileSync(file, '\n{"n":3}\n');
    assert.deepEqual(ns(readLines(file)), [1, 2, 3]);
  });
});

describe('readLines: a line still being written', () => {
  test('a half-written line is not shown until it is complete', () => {
    const file = fileNamed('half');
    fs.writeFileSync(file, '{"n":1}\n{"n":2');
    assert.deepEqual(ns(readLines(file)), [1]);
    fs.appendFileSync(file, '}\n');
    assert.deepEqual(ns(readLines(file)), [1, 2]);
  });

  test('a multi-byte character cut in two by a read is not corrupted', () => {
    const file = fileNamed('multibyte');
    const bytes = Buffer.from(`${JSON.stringify({ t: 'שלום' })}\n`, 'utf8');
    const cut = bytes.indexOf(Buffer.from('ש', 'utf8')) + 1; // inside the two-byte letter
    fs.writeFileSync(file, bytes.subarray(0, cut));
    assert.deepEqual(readLines(file), []);
    fs.appendFileSync(file, bytes.subarray(cut));
    assert.deepEqual(readLines(file), [{ t: 'שלום' }]);
  });
});

describe('readLines: a file that was rewritten or is missing', () => {
  test('a file that became shorter (cut or replaced) is read again from the start', () => {
    const file = fileNamed('truncated');
    fs.writeFileSync(file, '{"n":1}\n{"n":2}\n{"n":3}\n');
    assert.deepEqual(ns(readLines(file)), [1, 2, 3]);
    fs.writeFileSync(file, '{"n":9}\n');
    assert.deepEqual(ns(readLines(file)), [9]);
  });

  test('a file that does not exist throws (the caller decides what a missing conversation means)', () => {
    assert.throws(() => readLines(fileNamed('absent')), { code: 'ENOENT' });
  });
});
