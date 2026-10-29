/** Rewinding files: the CLI restores what its edit tools changed after a message (control request rewind_files). */
const { httpError } = require('../http-utils');
const runtime = require('../session-runtime');

const TIMEOUT_MS = 30000;

/**
 * @param {boolean} dryRun true: only say what would change
 * @returns {Promise<{canRewind:boolean, error?:string, filesChanged?:string[], insertions?:number, deletions?:number}>} never rejects
 */
async function askFiles(session, config, uuid, dryRun) {
  try {
    const answer = await runtime.control(session, config, 'rewind_files', { user_message_id: uuid, ...(dryRun && { dry_run: true }) }, TIMEOUT_MS);
    return answer && typeof answer === 'object' ? answer : { canRewind: false, error: 'תשובה לא מוכרת מ-Claude Code' };
  } catch (error) {
    const unsupported = /unsupported|not supported/i.test(error.message);
    return { canRewind: false, error: unsupported ? 'הגרסה המותקנת של Claude Code לא תומכת בשחזור קבצים.' : error.message };
  }
}

/** What a restore would change, for the dialog. */
async function previewFiles(session, config, uuid) {
  const answer = await askFiles(session, config, uuid, true);
  return {
    available: Boolean(answer.canRewind), reason: answer.canRewind ? null : answer.error || 'אין נקודת שחזור לקבצים בהודעה הזאת.',
    files: (Array.isArray(answer.filesChanged) ? answer.filesChanged : []).slice(0, 20).map(String),
    insertions: Number(answer.insertions) || 0, deletions: Number(answer.deletions) || 0,
  };
}

/** Restores the files. @throws {Error} 409 when the CLI cannot */
async function restoreFiles(session, config, uuid) {
  const answer = await askFiles(session, config, uuid, false);
  if (!answer.canRewind) throw httpError(409, answer.error || 'לא ניתן לשחזר את הקבצים.');
  return answer;
}

module.exports = { previewFiles, restoreFiles };
