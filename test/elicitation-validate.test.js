// Unit tests for lib/elicitation/elicitation-validate.js: the user's answer checked against the fields of the card.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { validateContent } = require('../lib/elicitation/elicitation-validate');

const FIELDS = [
  { name: 'name', title: 'שם', type: 'string', required: true },
  { name: 'age', title: 'גיל', type: 'integer', required: false, min: 0, max: 120 },
  { name: 'color', title: 'צבע', type: 'select', required: false, options: [{ value: 'red', label: 'אדום' }] },
  { name: 'tags', title: 'תגיות', type: 'multiselect', required: false, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  { name: 'agree', title: 'מסכים', type: 'boolean', required: false },
  { name: 'meta', title: 'מטא', type: 'json', required: false },
];

/** Runs validateContent and returns the error (or null); the result is compared as a plain object. */
const failureOf = (fields, content) => {
  try {
    validateContent(fields, content);
    return null;
  } catch (error) {
    return error;
  }
};

describe('validateContent: what goes back to the CLI', () => {
  test('keeps only schema keys and leaves out an optional field that is empty', () => {
    const result = validateContent(FIELDS, { name: 'Dana', extra: 'not in the schema', age: '', color: undefined });
    assert.deepEqual({ ...result }, { name: 'Dana' });
  });

  test('accepts a value of every type that fits its field', () => {
    const result = validateContent(FIELDS, { name: 'Dana', age: 30, color: 'red', tags: ['a', 'b'], agree: false, meta: { deep: [1] } });
    assert.deepEqual({ ...result }, { name: 'Dana', age: 30, color: 'red', tags: ['a', 'b'], agree: false, meta: { deep: [1] } });
  });

  test('a missing or empty required field is a 400 that names the field', () => {
    const error = failureOf(FIELDS, { name: '' });
    assert.equal(error.status, 400);
    assert.equal(error.message, 'שם: שדה חובה');
  });
});

describe('validateContent: values checked against their field', () => {
  test('an integer must be whole and inside its range', () => {
    assert.equal(failureOf(FIELDS, { name: 'x', age: 1.5 }).message, 'גיל: צריך מספר שלם');
    assert.equal(failureOf(FIELDS, { name: 'x', age: 121 }).message, 'גיל: מחוץ לטווח המותר');
    assert.equal(failureOf(FIELDS, { name: 'x', age: 120 }), null);
  });

  test('a choice must be one of the options, for a single or several choices', () => {
    assert.equal(failureOf(FIELDS, { name: 'x', color: 'blue' }).message, 'צבע: ערך שאינו ברשימה');
    assert.equal(failureOf(FIELDS, { name: 'x', tags: ['a', 'zzz'] }).message, 'תגיות: ערך שאינו ברשימה');
    assert.equal(failureOf(FIELDS, { name: 'x', tags: 'a' }).message, 'תגיות: ערך שאינו ברשימה');
  });

  test('a value of the wrong type is refused', () => {
    assert.equal(failureOf(FIELDS, { name: 5 }).message, 'שם: טקסט לא תקין');
    assert.equal(failureOf(FIELDS, { name: 'x', agree: 'yes' }).message, 'מסכים: צריך לבחור כן או לא');
  });

  test('an answer that is not an object is a 400', () => {
    for (const content of [null, ['name'], 'Dana']) {
      assert.equal(failureOf(FIELDS, content).status, 400);
    }
  });

  test('a text longer than 5000 characters is refused', () => {
    assert.equal(failureOf(FIELDS, { name: 'a'.repeat(5001) }).status, 400);
  });
});

describe('validateContent: size and unusual names', () => {
  test('an answer over 64 KB is a 413, even when each field is within its own limit', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ name: `f${index}`, title: `f${index}`, type: 'string', required: false }));
    const content = Object.fromEntries(many.map(field => [field.name, 'a'.repeat(5000)]));
    const error = failureOf(many, content);
    assert.equal(error.status, 413);
  });

  test('a field named __proto__ is kept as an own property of a plain-prototype-free result', () => {
    const content = JSON.parse('{"__proto__": "value", "other": 1}');
    const result = validateContent([{ name: '__proto__', title: 'p', type: 'string', required: true }], content);
    assert.equal(Object.getPrototypeOf(result), null);
    assert.equal(Object.hasOwn(result, '__proto__'), true);
    assert.equal(result.__proto__, 'value');
  });
});
