/** `!` in the composer (bash mode): the text after it runs as a shell command in the session's folder. */
import { api } from '../api.js';
import { activeSession } from '../state.js';
import { currentShell } from './shell-choice.js';

/** @returns {string|null} the command of a `!` line ("!ls" -> "ls"), null when the text is not one */
export function bangCommand(text) {
  return text.startsWith('!') ? text.slice(1).trim() : null;
}

/**
 * Runs a `!` command in the active session.
 * @param {(error:Error)=>void} report shows an error
 * @param {(message:string)=>void} say shows a hint
 * @returns {Promise<boolean>} the line was taken (the composer clears it)
 */
export async function runBang(command, { report, say }) {
  const session = activeSession();
  if (!session) { say('פקודות ! רצות בתיקיית סשן – פתח סשן קודם'); return false; }
  if (!command) { say('אחרי ה-! כתוב פקודת shell (למשל: git status)'); return false; }
  try {
    await api.runShell(session.id, command, 'bang', currentShell());
    return true;
  } catch (error) {
    report(error);
    return false;
  }
}
