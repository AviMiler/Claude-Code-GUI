/** Deleting a session that runs in a worktree: whether its folder goes too (its branch always stays), and the outcome. */
import { state } from '../state.js';
import { ask, toast } from '../ui.js';

/**
 * Asked after "delete the session?", and only when no other session (a fork) works in the same worktree.
 * @returns {Promise<boolean>} true: remove the worktree folder as well
 */
export async function confirmWorktreeRemoval(session) {
  const tree = session.worktree;
  if (!tree || [...state.sessions.values()].some(other => other.id !== session.id && other.worktree?.path === tree.path)) return false;
  return ask({
    title: 'להסיר גם את ה-worktree?',
    // \u2068…\u2069 isolate the Latin path and branch, so the Hebrew sentence does not reorder their parts.
    text: `התיקייה \u2068${tree.path}\u2069 תימחק, כולל קבצים ש-git מתעלם מהם (כמו node_modules). הענף \u2068${tree.branch}\u2069 נשמר.\n`
      + 'אם יש בה שינויים שלא נשמרו ב-commit, היא תישאר. אחרי ההסרה אי אפשר להמשיך את השיחה מ"שיחות קודמות".',
    confirmLabel: 'הסרת ה-worktree', cancelLabel: 'להשאיר', danger: true,
  });
}

/** @param {{worktreeRemoved:boolean, worktreeError?:string}} result the server's answer to the delete */
export function reportWorktreeRemoval(session, result) {
  if (result.worktreeRemoved) toast(`ה-worktree הוסר. הענף ${session.worktree.branch} נשמר.`);
  else toast(`ה-worktree נשאר ב-${session.worktree.path}: ${result.worktreeError || 'לא הוסר'}`, 'error');
}
