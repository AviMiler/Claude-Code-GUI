// Unit tests for lib/session-options.js: checks of a PATCH of per-session options, fork copies and CLI flags.
// Uses a temp data folder: session-prompt writes the system prompt file there. CLAUDE_GUI_DATA is set BEFORE requiring.
const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
process.env.CLAUDE_GUI_DATA = dataDir;
const { textChanges, checkText, optionArgs, copiedOptions } = require('../lib/session-options');

after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
// lib/session-store.js writes its file on exit; this runs after that hook (registered later) and removes the folder again.
process.on('exit', () => fs.rmSync(dataDir, { recursive: true, force: true }));

const CONFIG = { model: 'config-model' };
const NONE = {}; // a session as stored, with nothing set
const expectStatus = (fn, status, message) => {
  const error = (() => { try { fn(); return null; } catch (failure) { return failure; } })();
  assert.ok(error, 'expected an error');
  assert.equal(error.status, status);
  if (message) assert.equal(error.message, message);
};

describe('textChanges: the fields that are stored', () => {
  test('an empty patch changes nothing, and text fields are trimmed', () => {
    assert.deepEqual(textChanges({}, NONE, CONFIG), {});
    assert.deepEqual(textChanges({ model: '  m1 ', effort: ' high ', agent: '', outputStyle: 'Explanatory ' }, NONE, CONFIG),
      { model: 'm1', effort: 'high', agent: '', outputStyle: 'Explanatory' });
  });

  test('thinkingOff and safeMode must be real booleans', () => {
    expectStatus(() => textChanges({ thinkingOff: 'yes' }, NONE, CONFIG), 400, 'ערך לא תקין');
    expectStatus(() => textChanges({ safeMode: 1 }, NONE, CONFIG), 400, 'ערך לא תקין');
    assert.deepEqual(textChanges({ thinkingOff: true }, NONE, CONFIG), { thinkingOff: true });
  });

  test('turning safe mode on in a mode it forbids moves the session back to asking (default)', () => {
    assert.deepEqual(textChanges({ safeMode: true }, { mode: 'bypassPermissions' }, CONFIG), { safeMode: true, mode: 'default' });
    assert.deepEqual(textChanges({ safeMode: true }, { mode: 'plan' }, CONFIG), { safeMode: true });
  });

  test('a color must be empty (cleared) or one of the palette keys', () => {
    assert.deepEqual(textChanges({ color: '' }, NONE, CONFIG), { color: '' });
    assert.deepEqual(textChanges({ color: 'teal' }, NONE, CONFIG), { color: 'teal' });
    expectStatus(() => textChanges({ color: 'mauve' }, NONE, CONFIG), 400, 'צבע לא מוכר');
  });

  test('a system prompt is trimmed; too long, not text, or an unknown mode is a 400', () => {
    assert.deepEqual(textChanges({ systemPrompt: '  be brief  ', systemPromptMode: 'append' }, NONE, CONFIG),
      { systemPrompt: 'be brief', systemPromptMode: 'append' });
    expectStatus(() => textChanges({ systemPrompt: 'a'.repeat(20001) }, NONE, CONFIG), 400);
    expectStatus(() => textChanges({ systemPrompt: 'bad\0text' }, NONE, CONFIG), 400);
    expectStatus(() => textChanges({ systemPromptMode: 'rewrite' }, NONE, CONFIG), 400);
  });
});

describe('textChanges: the fallback model', () => {
  test('an id with spaces or shell characters is refused', () => {
    expectStatus(() => textChanges({ fallbackModel: 'llama 3' }, NONE, CONFIG), 400);
    expectStatus(() => textChanges({ fallbackModel: 'a&b' }, NONE, CONFIG), 400);
  });

  test('a fallback equal to the main model is refused, the main being the one the patch sets', () => {
    expectStatus(() => textChanges({ fallbackModel: 'config-model' }, NONE, CONFIG), 400, 'מודל הגיבוי חייב להיות שונה מהמודל הראשי');
    expectStatus(() => textChanges({ model: 'm2', fallbackModel: 'm2' }, NONE, CONFIG), 400);
  });

  test('a valid fallback is stored trimmed, and an empty one clears it', () => {
    assert.deepEqual(textChanges({ fallbackModel: ' qwen3:8b ' }, NONE, CONFIG), { fallbackModel: 'qwen3:8b' });
    assert.deepEqual(textChanges({ fallbackModel: '' }, { fallbackModel: 'x' }, CONFIG), { fallbackModel: '' });
  });
});

describe('optionArgs: flags for the CLI', () => {
  test('--fallback-model is passed only when the CLI lists it and it differs from the main model', () => {
    const session = { id: 's1', model: 'main', fallbackModel: 'backup' };
    assert.deepEqual(optionArgs(session, CONFIG, flag => flag === '--fallback-model'), ['--fallback-model', 'backup']);
    assert.deepEqual(optionArgs(session, CONFIG, () => false), []);
    assert.deepEqual(optionArgs({ ...session, fallbackModel: 'main' }, CONFIG, () => true), []);
  });

  test('a system prompt goes through a file: its path follows the flag of the mode', () => {
    const supports = () => true;
    const append = optionArgs({ id: 'p1', systemPrompt: 'Answer in Hebrew', systemPromptMode: 'append' }, CONFIG, supports);
    assert.equal(append[0], '--append-system-prompt-file');
    assert.ok(append[1].startsWith(dataDir));
    assert.equal(fs.readFileSync(append[1], 'utf8'), 'Answer in Hebrew');

    const replace = optionArgs({ id: 'p2', systemPrompt: 'Only this', systemPromptMode: 'replace' }, CONFIG, supports);
    assert.equal(replace[0], '--system-prompt-file');
  });

  test('no system prompt flag when the CLI lacks it', () => {
    assert.deepEqual(optionArgs({ id: 'p3', systemPrompt: 'x' }, CONFIG, () => false), []);
  });
});

describe('copiedOptions: what a fork keeps', () => {
  test('copies the fork keys that are set, but not the color or the model', () => {
    const copied = copiedOptions({
      id: 'old', model: 'm1', color: 'red', fallbackModel: 'm2', thinkingOff: false, systemPrompt: undefined,
    });
    assert.deepEqual(copied, { fallbackModel: 'm2', thinkingOff: false });
  });
});

describe('checkText: one text option', () => {
  test('a missing value is empty, and a value is trimmed', () => {
    assert.equal(checkText('effort', undefined), '');
    assert.equal(checkText('effort', null), '');
    assert.equal(checkText('effort', ' high '), 'high');
  });

  test('an effort level outside the list is refused', () => {
    expectStatus(() => checkText('effort', 'extreme'), 400);
  });

  test('a model name with shell characters is refused; a non-string is refused', () => {
    expectStatus(() => checkText('model', 'a&b'), 400);
    expectStatus(() => checkText('agent', 42), 400, 'ערך לא תקין');
  });

  test('an output style with a control character is refused', () => {
    expectStatus(() => checkText('outputStyle', 'bad\u0001style'), 400, 'שם סגנון הפלט לא תקין');
  });
});
