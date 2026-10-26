/** Turns a failed CLI process into a Hebrew explanation the user can act on. */

/**
 * @param {{code:number|null, stderr:string, spawnError:Error|null}} info From cli-process onExit.
 * @returns {string}
 * @example describeFailure({ code: 1, stderr: 'Invalid API key', spawnError: null })
 */
function describeFailure({ code, stderr, spawnError }) {
  if (spawnError) {
    return `לא ניתן להפעיל את Claude (${spawnError.message}). בדוק את claudePath בקובץ config.json.`;
  }
  if (/Select model number/i.test(stderr)) {
    return 'claudePath מצביע על סקריפט עוטף שמבקש לבחור מודל, ולא על Claude Code עצמו. '
      + 'עדכן ב-config.json את claudePath לקובץ ההרצה האמיתי, את model לשם המודל, ואת env לכתובת ולטוקן.';
  }
  if (/unknown option|error: option/i.test(stderr)) {
    return `גרסת Claude Code לא מכירה אחד הדגלים שהממשק שלח.\n${stderr}`;
  }
  return `Claude נסגר עם קוד ${code}.${stderr ? `\n${stderr}` : ''}`;
}

module.exports = { describeFailure };
