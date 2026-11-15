// Unit tests for lib/transcripts.js: reading the CLI's conversation files (the partial last line, titles, the chain
// a resume follows, the text of a line). Each test writes its own files in a temp folder; the CLI config folder is
// given in config.env, so the real ~/.claude is never touched.
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
process.env.CLAUDE_GUI_DATA = path.join(root, 'data');
// lib/transcripts.js is now split into lib/transcripts/*: the file reading and the item helpers.
const transcripts = { ...require('../lib/transcripts/transcript-files'), ...require('../lib/transcripts/transcript-items') };

const CWD = path.join(root, 'work', 'my project');
const CONFIG = { model: '', env: { CLAUDE_CONFIG_DIR: path.join(root, 'claude-config') } };
const PROJECT_DIR = path.join(root, 'claude-config', 'projects', CWD.replace(/[^a-zA-Z0-9]/g, '-'));
const ID = 'conv-1';

/** Writes a conversation file for ID with the given text (the caller decides the newlines). */
function writeConversation(text) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, `${ID}.jsonl`), text);
}
const line = object => JSON.stringify(object);

before(() => fs.mkdirSync(PROJECT_DIR, { recursive: true }));
after(() => fs.rmSync(root, { recursive: true, force: true }));

describe('readConversation: the lines of a file', () => {
  test('a partial last line (the CLI is still writing it) is left out; the complete lines are kept', () => {
    writeConversation(`${line({ type: 'user', uuid: 'u1', message: { content: 'hi' } })}\n\n`
      + `${line({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', message: { content: [] } })}\n{"type":"assi`);
    const result = transcripts.readConversation(CONFIG, { cwd: CWD, id: ID });
    assert.deepEqual(result.lines.map(entry => entry.uuid), ['u1', 'a1']);
    assert.equal(typeof result.mtimeMs, 'number');
  });

  test('Hebrew and emoji survive the read unchanged', () => {
    writeConversation(`${line({ type: 'user', uuid: 'u1', message: { content: 'שלום 👋' } })}\n`);
    const [entry] = transcripts.readConversation(CONFIG, { cwd: CWD, id: ID }).lines;
    assert.equal(transcripts.rawText(entry), 'שלום 👋');
  });

  test('an unknown conversation or an id that is not a plain name gives null', () => {
    assert.equal(transcripts.readConversation(CONFIG, { cwd: CWD, id: 'missing' }), null);
    assert.equal(transcripts.readConversation(CONFIG, { cwd: CWD, id: '../conv-1' }), null);
  });
});

describe('readTitles: the title of a conversation', () => {
  test('the last custom title wins over the automatic one', () => {
    writeConversation([
      line({ type: 'ai-title', aiTitle: 'Automatic' }),
      line({ type: 'custom-title', customTitle: 'Mine' }),
      line({ type: 'custom-title', customTitle: 'Final name' }),
    ].join('\n') + '\n');
    const titles = transcripts.readTitles(CONFIG, { cwd: CWD, id: ID });
    assert.equal(titles.custom, 'Final name');
    assert.equal(titles.auto, 'Automatic');
  });

  test('appendTitle adds a custom-title line that the next read sees', () => {
    writeConversation(`${line({ type: 'ai-title', aiTitle: 'Auto' })}\n`);
    assert.equal(transcripts.appendTitle(CONFIG, { cwd: CWD, id: ID, title: 'Renamed' }), true);
    assert.equal(transcripts.readTitles(CONFIG, { cwd: CWD, id: ID }).custom, 'Renamed');
    assert.equal(transcripts.appendTitle(CONFIG, { cwd: CWD, id: 'nope', title: 'x' }), false);
  });
});

describe('chainOf: the conversation a resume follows', () => {
  // a -> b -> c, and d branches off b (what a rewind leaves behind).
  const lines = [
    { uuid: 'a', parentUuid: null, type: 'user' },
    { uuid: 'b', parentUuid: 'a', type: 'assistant' },
    { uuid: 'c', parentUuid: 'b', type: 'user' },
    { uuid: 'd', parentUuid: 'b', type: 'user' },
  ];

  test('by default it follows the last line back to the start', () => {
    assert.deepEqual(transcripts.chainOf(lines).map(entry => entry.uuid), ['a', 'b', 'd']);
  });

  test('a leaf given explicitly (a rewind point) is the end of the chain', () => {
    assert.deepEqual(transcripts.chainOf(lines, 'c').map(entry => entry.uuid), ['a', 'b', 'c']);
  });

  test('side-chain lines (subagents) are not part of it', () => {
    const withSide = [...lines, { uuid: 'x', parentUuid: 'd', type: 'assistant', isSidechain: true }];
    assert.deepEqual(transcripts.chainOf(withSide).map(entry => entry.uuid), ['a', 'b', 'd']);
  });
});

describe('rawText: the text of a line', () => {
  test('joins the text blocks of a message and reads a queued correction from its attachment', () => {
    assert.equal(transcripts.rawText({ type: 'user', message: { content: [
      { type: 'text', text: 'one' }, { type: 'image', source: {} }, { type: 'text', text: 'two' },
    ] } }), 'one\ntwo');
    assert.equal(transcripts.rawText({ type: 'attachment', attachment: { prompt: 'fix it' } }), 'fix it');
  });
});
