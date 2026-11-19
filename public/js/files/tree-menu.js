/** The right-click menu of a Files-pane tree row: open its folder (a file's own folder) in a new terminal. */
import { icon } from '../icons.js';
import { openContextMenu } from '../context-menu/menu.js';
import { canOpenInTerminal, openInTerminal } from '../terminal/open-in-terminal.js';

/**
 * @param {{id:string}} session @param {string} path relative to the session's folder (the server resolves and validates it)
 * @returns {(event:MouseEvent)=>void} a contextmenu listener
 */
export function terminalMenu(session, path) {
  return event => {
    if (!canOpenInTerminal(session.id)) return;
    event.preventDefault();
    openContextMenu(event, [{ icon: 'terminal', title: 'פתיחה בטרמינל', onSelect: () => openInTerminal(session.id, path) }]);
  };
}
