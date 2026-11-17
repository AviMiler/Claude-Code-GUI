/** A failed save of the Files editor, in words for the header: a short Hebrew text, and the server's full message for the note and the title. */

const BY_CODE = [
  [/\b(EPERM|EACCES)\b/, 'אין הרשאת כתיבה לקובץ'],
  [/\bEBUSY\b/, 'הקובץ תפוס על ידי תוכנה אחרת'],
  [/\bENOSPC\b/, 'אין מקום פנוי בדיסק'],
  [/\bEROFS\b/, 'הקובץ נמצא במערכת קבצים לקריאה בלבד'],
];
const ABSOLUTE_PATH = /'?(?:[A-Za-z]:[\\/]|\/)[^'"\n]*'?/g;

/**
 * @param {string} message the server's error text (it may hold a code such as EPERM and an absolute path)
 * @returns {{short:string, full:string}} short: no path, for the header (it also gets an ellipsis from CSS when too long)
 * @example describeSaveError("לא ניתן לכתוב לקובץ: EPERM: operation not permitted, open 'C:\\a\\b.txt'").short // 'אין הרשאת כתיבה לקובץ'
 */
export function describeSaveError(message) {
  const full = String(message || '');
  const known = BY_CODE.find(([pattern]) => pattern.test(full));
  return { short: known ? known[1] : full.replace(ABSOLUTE_PATH, '').replace(/[\s,:]+$/, '').trim() || full, full };
}
