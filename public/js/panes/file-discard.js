/**
 * "ביטול השינויים בקובץ" in the Changes pane: a button on a file's header and an item in its right-click menu. Asks
 * first (nothing can bring the changes back), then the server checks that the file is still as the pane showed it
 * (status code and diff fingerprint from the diff answer's fileStates) and restores it to HEAD or deletes a new file.
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { ask, toast } from '../ui.js';
import { state } from '../state.js';
import { invalidateSessionFetches } from './session-fetch.js';

const TITLE = 'ביטול השינויים בקובץ';
const targets = new WeakMap(); // a file header on screen -> what discarding it needs (read by the file menu)
let busy = false; // one discard at a time

/** What will happen to the file, in the user's words. @param {string} path @param {{status:string, path:string, oldPath:string|null}} file */
function outcome(path, file) {
  const [x, y] = file.status;
  if (x === '?') return `${path} הוא קובץ חדש שאינו ב-git: הוא יימחק מהדיסק.`;
  if (x === 'A' || y === 'A' || x === 'C') return `${path} הוא קובץ חדש: הוא יוסר מה-stage ויימחק מהדיסק.`;
  if (x === 'R' || y === 'R') return `שינוי השם יבוטל: ${file.path} יימחק, ו-${file.oldPath} יחזור לגרסה שב-commit האחרון.`;
  if (x === 'D' || y === 'D') return `${path} נמחק: הוא יחזור לגרסה שב-commit האחרון.`;
  return `${path} יחזור לגרסה שב-commit האחרון. כל השינויים בו, גם אלה שב-stage, יימחקו.`;
}

/** @param {string} sessionId @param {string} path @param {object} file the fileStates entry @param {()=>void} onDone */
async function discard(sessionId, path, file, onDone) {
  if (busy) return;
  busy = true;
  try {
    const running = state.sessions.get(sessionId)?.status === 'running';
    const text = [outcome(path, file), 'לא ניתן לשחזר: אין "בטל" בממשק, ו-Claude לא יקבל הודעה על כך.',
      running ? 'Claude עדיין עובד וייתכן שהוא משנה קבצים.' : null].filter(Boolean).join('\n\n');
    if (!await ask({ title: TITLE, text, confirmLabel: 'ביטול השינויים', cancelLabel: 'השארת השינויים', danger: true })) return;
    try {
      await api.discardFile(sessionId, { path, status: file.status, diffHash: file.hash });
      toast(`השינויים ב-${path} בוטלו`);
    } catch (error) {
      toast(error.message, 'error');
    }
    invalidateSessionFetches(sessionId); // the pane and the rail fetch again (also after a "changed since" refusal)
    onDone();
  } finally {
    busy = false;
  }
}

/** A file the pane can offer it for: listed in fileStates (one status entry, one diff part) and not in conflict. */
const offered = file => Boolean(file && !file.conflict && typeof file.status === 'string' && file.status.length === 2);

/**
 * @param {string} path the file's path as the pane shows it @param {object|undefined} file its fileStates entry
 * @param {HTMLElement} head the file's header (it carries data-file-path, where the file menu opens)
 * @param {{sessionId:string, onDone:()=>void}} options onDone: after a try, so the pane draws again
 * @returns {HTMLElement|null} the header button, or null when the file cannot be discarded from here
 */
export function discardFileButton(path, file, head, { sessionId, onDone }) {
  if (!offered(file)) return null;
  const run = () => discard(sessionId, path, file, onDone);
  targets.set(head, run);
  return h('button', { type: 'button', class: 'icon-button diff-file-discard', title: `${TITLE} (אין אפשרות לשחזר)`, 'aria-label': TITLE,
    onClick: event => { event.stopPropagation(); run(); } }, icon('history'));
}

/**
 * The file menu's item for a Changes pane header, or null for any other file path.
 * @param {HTMLElement} element the element with data-file-path the menu opened on @returns {object|null} a popover.js entry
 */
export function discardMenuEntry(element) {
  const run = targets.get(element);
  return run ? { icon: 'history', title: TITLE, danger: true, onSelect: run } : null;
}
