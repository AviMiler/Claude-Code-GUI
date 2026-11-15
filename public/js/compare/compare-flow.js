/**
 * "Compare": forks the session, sets the chosen model / effort on the fork before its first message, opens it in the
 * split pane and sends the last user message there. The original stays open and untouched.
 */
import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../ui.js';
import { fromStored, forServer } from '../attachments.js';
import { lastPoint } from '../retry/last-turn.js';

const NARROW = matchMedia('(max-width: 1000px)');

/**
 * @param {object} session @param {{model?:string, effort?:string}} settings only the keys present are changed on the fork
 * @param {{openInSplit:(id:string)=>void}} actions
 */
export async function compareLast(session, settings, actions) {
  const point = lastPoint(session);
  if (!point) { toast('אי אפשר להשוות: ההודעה האחרונה אינה נקודת חזרה.'); return; }
  let fork;
  try {
    fork = await api.fork(session.id);
    state.sessions.set(fork.id, fork);
    if (Object.keys(settings).length) await api.updateSession(fork.id, settings);
  } catch (error) { toast(error.message, 'error'); return; }
  if (NARROW.matches) { toast(`נוצר ענף "${fork.name}". החלון צר מדי לפיצול, לכן ההודעה לא נשלחה בו.`); return; }
  actions.openInSplit(fork.id);
  const { images, files } = forServer(fromStored(point.item));
  try { await api.sendMessage(fork.id, point.item.text, images, files); } catch (error) { toast(error.message, 'error'); return; }
  toast('הענף נפתח בחלון המפוצל וההודעה נשלחה בו');
}
