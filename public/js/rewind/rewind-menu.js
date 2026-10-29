/**
 * Where a rewind starts: the hover button on a user message, its context menu, and /rewind (for the last one). One
 * listener for the whole page; the buttons only exist on messages the CLI can go back to (they carry a uuid).
 */
import { state, activeSession } from '../state.js';
import { toast } from '../ui.js';
import { openContextMenu, hasSelection } from '../context-menu/menu.js';
import { openRewindDialog } from './rewind-dialog.js';

let composer = null;

/** The main session's message elements only: the split pane has no rewind. */
const mainMessage = element => (element && !element.closest('[data-split-session]') ? element.closest('.msg-user[data-rewind-uuid]') : null);

function start(sessionId, uuid) {
  const session = state.sessions.get(sessionId);
  if (!session) return;
  if (session.status === 'running') { toast('Claude עובד כרגע. עצור את הריצה ורק אז חזור לנקודה קודמת.'); return; }
  openRewindDialog(sessionId, uuid, composer);
}

/** /rewind: back to the last message the CLI can go back to. */
export function rewindLast(session) {
  const last = [...(session?.items || [])].reverse().find(item => item.kind === 'user' && item.cliUuid && !item.correction);
  if (!last) { toast('אין הודעה שאפשר לחזור אליה בסשן הזה'); return; }
  start(session.id, last.cliUuid);
}

/** @param {{restore:Function}} target the main composer (the message goes back into it) */
export function enableRewind(target) {
  composer = target;
  document.addEventListener('click', event => {
    const message = event.target.closest('[data-rewind]') && mainMessage(event.target);
    if (message && state.activeId) start(state.activeId, message.dataset.rewindUuid);
  });
  document.addEventListener('contextmenu', event => {
    const message = mainMessage(event.target);
    if (!message || hasSelection() || !activeSession()) return;
    event.preventDefault();
    openContextMenu(event, [{ icon: 'history', title: 'חזרה להודעה זו…', onSelect: () => start(state.activeId, message.dataset.rewindUuid) }]);
  });
}
