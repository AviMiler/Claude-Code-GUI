/**
 * "Try again": the conversation goes back to before the last user message (the existing rewind route, conversation
 * only) and the same message is sent again through the normal send path. Files are not restored.
 */
import { api } from '../api.js';
import { toast } from '../ui.js';
import { fromStored } from '../attachments.js';
import { lastPoint, changedFiles } from './last-turn.js';

/**
 * @param {object} session the open session
 * @param {{send:Function}} actions actions.js (the normal send path)
 * @param {{restore:Function}} composer where the message goes if sending fails after the rewind
 */
export async function retryLast(session, actions, composer) {
  const point = lastPoint(session);
  if (!point) { toast('אי אפשר לנסות שוב: ההודעה האחרונה אינה נקודת חזרה.'); return; }
  const touched = changedFiles(session, point.index);
  let result;
  try { result = await api.rewind(session.id, point.item.cliUuid, 'conversation'); } catch (error) { toast(error.message, 'error'); return; }
  const attachments = fromStored(result);
  if (!(await actions.send(result.text, attachments))) {
    composer.restore([{ text: result.text, attachments }]);
    toast('השיחה הוחזרה אבל השליחה נכשלה. ההודעה בתיבת הכתיבה.', 'error');
    return;
  }
  toast(touched ? 'ההודעה נשלחה שוב. הקבצים ש-Claude שינה בניסיון הקודם נשארו כמו שהם.' : 'ההודעה נשלחה שוב');
}
