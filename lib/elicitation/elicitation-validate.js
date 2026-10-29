/** The user's answer to an elicitation form, checked against the fields the card was drawn from. Only schema keys get through. */
const { httpError } = require('../http-utils');

const MAX_CONTENT_BYTES = 64 * 1024;
const MAX_STRING = 5000;

const isEmpty = value => value === undefined || value === null || value === '';

/** @returns {*} the checked value of one field @throws {Error} 400 naming the field */
function checkField(field, value) {
  const fail = why => { throw httpError(400, `${field.title}: ${why}`); };
  switch (field.type) {
    case 'string': if (typeof value !== 'string' || value.length > MAX_STRING) fail('טקסט לא תקין'); return value;
    case 'boolean': if (typeof value !== 'boolean') fail('צריך לבחור כן או לא'); return value;
    case 'number': case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value))) fail(field.type === 'integer' ? 'צריך מספר שלם' : 'צריך מספר');
      if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) fail('מחוץ לטווח המותר');
      return value;
    case 'select': if (!field.options.some(option => option.value === value)) fail('ערך שאינו ברשימה'); return value;
    case 'multiselect':
      if (!Array.isArray(value) || !value.every(item => field.options.some(option => option.value === item))) fail('ערך שאינו ברשימה');
      return value;
    default: return value; // json: any value the browser parsed
  }
}

/**
 * @param {object[]} fields from the prompt @param {object} content what the browser sent (field name -> value)
 * @returns {object} content with only the fields of the schema, an empty optional field left out
 * @throws {Error} 400 for a missing required field or a value that does not fit its field
 */
function validateContent(fields, content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw httpError(400, 'תשובה לא תקינה');
  const clean = Object.create(null); // a field may be named __proto__ or constructor
  for (const field of fields) {
    const value = Object.hasOwn(content, field.name) ? content[field.name] : undefined;
    if (isEmpty(value)) {
      if (field.required) throw httpError(400, `${field.title}: שדה חובה`);
      continue;
    }
    clean[field.name] = checkField(field, value);
  }
  if (Buffer.byteLength(JSON.stringify(clean)) > MAX_CONTENT_BYTES) throw httpError(413, 'התשובה גדולה מדי');
  return clean;
}

module.exports = { validateContent };
