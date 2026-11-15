/**
 * "סכם ונקה": after a confirmation (it costs a model turn) sends ONE summarizing message through the normal send path,
 * waits for that turn to end (cancellable), runs /clear through the existing clear action, then puts the summary into
 * the composer as a draft. Nothing is sent after the clear: the user reads and sends the draft.
 */
import { state } from '../state.js';
import { toast, ask } from '../ui.js';

export const SUMMARY_PROMPT = 'סכם את השיחה עד כה כדי שאפשר יהיה להמשיך אותה בשיחה חדשה: המטרה, מה הוחלט, מה נעשה (כולל קבצים ששונו), '
  + 'מה נשאר לעשות ופרטים שחייבים לזכור. כתוב רק את הסיכום עצמו, בלי הקדמה ובלי להשתמש בכלים.';
const POLL_MS = 400;

/** The summary turn: the text Claude wrote after our message, or null while that turn has not ended. */
function findSummary(session, from) {
  const items = session.items || [];
  const start = items.findIndex((item, index) => index >= from && item.kind === 'user' && item.text === SUMMARY_PROMPT);
  if (start < 0) return null;
  const end = items.findIndex((item, index) => index > start && item.kind === 'result' && !item.parent);
  if (end < 0 || session.status === 'running') return null;
  const text = items.slice(start + 1, end).filter(item => item.kind === 'text' && !item.parent).map(item => item.text.trim()).join('\n\n');
  return { text, failed: items[end].isError };
}

/**
 * @param {{session:object, actions:object, putDraft:(text:string)=>void, signal:AbortSignal, onWaiting:()=>void}} options
 * @returns {Promise<'done'|'declined'|'cancelled'|'failed'>}
 */
export async function summarizeAndClear({ session, actions, putDraft, signal, onWaiting }) {
  if (session.status === 'running') { toast('אפשר לסכם כשהתור הנוכחי מסתיים'); return 'declined'; }
  const yes = await ask({ title: 'לסכם ולנקות את ההקשר?', confirmLabel: 'סכם ונקה',
    text: 'Claude יכתוב סיכום של השיחה (תור אחד של המודל, ייקח זמן). אחר כך ההקשר ינוקה (/clear) והסיכום יחכה בתיבת הכתיבה כטיוטה: שום דבר לא יישלח בלי שתשלח בעצמך.' });
  if (!yes) return 'declined';
  const from = session.items.length;
  if (!await actions.send(SUMMARY_PROMPT)) return 'failed';
  onWaiting();
  let found = null;
  while (!found) {
    if (signal.aborted) return 'cancelled';
    const current = state.sessions.get(session.id);
    if (!current) return 'cancelled';
    found = findSummary(current, from);
    if (!found) await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
  if (found.failed || !found.text) { toast('הסיכום לא נכתב, ההקשר לא נוקה', 'error'); return 'failed'; }
  if (state.activeId !== session.id) { toast('עברת לסשן אחר: ההקשר לא נוקה. הסיכום נשאר בשיחה.'); return 'cancelled'; }
  await actions.clear();
  putDraft(`המשך מהשיחה הקודמת. זה הסיכום שלה:\n\n${found.text}`);
  toast('ההקשר נוקה. הסיכום מחכה בתיבת הכתיבה');
  return 'done';
}
