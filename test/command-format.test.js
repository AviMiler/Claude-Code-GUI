// Unit tests for lib/templates/command-format.js: a prompt template ({{name}} in the editor) as a CLI command file
// ($ARGUMENTS / $1..$9 in the body, front matter kept).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { toTemplate, toFile } = require('../lib/templates/command-format');

describe('toTemplate: a command file as the editor sees it', () => {
  test('the description is the name, and $1 / $2 become named variables from the argument hint', () => {
    const template = toTemplate('translate', '---\ndescription: "Translate"\nargument-hint: "[lang] [text]"\n---\nTranslate to $1: $2\n', 5);
    assert.equal(template.id, 'translate');
    assert.equal(template.name, 'Translate');
    assert.equal(template.text, 'Translate to {{lang}}: {{text}}\n');
    assert.equal(template.updatedAt, 5);
    assert.equal(template.expands, false);
  });

  test('a file without front matter takes its name from the file, and its body as the text', () => {
    const template = toTemplate('plain', 'Just text', 0);
    assert.equal(template.name, 'plain');
    assert.equal(template.text, 'Just text');
  });

  test('a Notepad byte-order mark in front of the front matter is ignored', () => {
    const template = toTemplate('bom', '﻿---\ndescription: "Hello"\n---\nHi $ARGUMENTS', 0);
    assert.equal(template.name, 'Hello');
    assert.equal(template.text, 'Hi {{ARGUMENTS}}');
  });

  test('a body that runs a shell command or reads a file is marked as expanding (the CLI fills it in)', () => {
    assert.equal(toTemplate('status', 'Status: !`git status`', 0).expands, true);
    assert.equal(toTemplate('read', '@notes.md please', 0).expands, true);
  });
});

describe('toFile: the editor text as a command file', () => {
  test('one variable becomes $ARGUMENTS, and the description and hint go to the front matter', () => {
    assert.equal(toFile({ description: 'Greet', text: 'Hi {{name}}' }),
      '---\ndescription: "Greet"\nargument-hint: "[name]"\n---\nHi $ARGUMENTS');
  });

  test('more variables become $1, $2 in order of first appearance', () => {
    const content = toFile({ description: 'Pair', text: 'A {{x}} B {{y}} C {{x}}' });
    assert.ok(content.endsWith('A $1 B $2 C $1'));
    assert.ok(content.includes('argument-hint: "[x] [y]"'));
  });

  test('more than nine variables is refused, and kept as {{name}} when migrating', () => {
    const text = Array.from({ length: 10 }, (_, index) => `{{v${index}}}`).join(' ');
    assert.throws(() => toFile({ description: 'Many', text }), error => error.status === 400);
    assert.doesNotThrow(() => toFile({ description: 'Many', text, lenient: true }));
  });
});

describe('toFile and toTemplate together', () => {
  test('other front-matter lines and the numbering of an existing file are kept', () => {
    const previous = '---\nargument-hint: "[y] [x]"\nallowed-tools: Bash\n---\nold $1 $2';
    const content = toFile({ description: 'Name', text: 'A {{x}} B {{y}}', previous });
    assert.ok(content.includes('allowed-tools: Bash'));
    assert.ok(content.includes('argument-hint: "[y] [x]"'), 'the old order of the variables stays');
    assert.equal(toTemplate('name', content, 0).text, 'A {{x}} B {{y}}');
  });

  test('a template that goes to a file and back gives the same text', () => {
    const text = 'Summarize {{topic}} in {{length}} words';
    const file = toFile({ description: 'Summary', text });
    const back = toTemplate('summary', file, 0);
    assert.equal(back.name, 'Summary');
    assert.equal(back.text, text);
  });
});
