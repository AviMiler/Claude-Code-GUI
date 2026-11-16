/** Page-wide keyboard shortcuts (shortcut-list.js names them); the composer, the panes and the dialogs handle their own keys. */
import { shortcutFor } from './shortcut-list.js';
import { pickByDigit } from './menu-digits.js';
import { toggleShortcutsDialog } from './shortcuts-dialog.js';

/** While one of these is open, Esc stops no turn and Ctrl+\ closes no pane: the dialog owns the keyboard. */
const MODAL = '.modal-backdrop, .popover, dialog[open]';

/**
 * @param {{slashMenu, newSession, toggleSidebar, settings, cycleView, toggleChanges, toggleTerminal, closePane, toggleSplit, stop,
 *   isRunning:()=>boolean}} run what each action of the table does (isRunning: Esc stops only a running turn);
 *   the Ctrl+/ dialog is this folder's own
 * @example bindShortcuts({ slashMenu: () => composer.insert('/'), ... })
 */
export function bindShortcuts(run) {
  const actions = { ...run, shortcuts: toggleShortcutsDialog };
  document.addEventListener('keydown', event => {
    if (pickByDigit(event)) return;
    const shortcut = shortcutFor(event);
    if (shortcut) {
      if (shortcut.action === 'closePane' && document.querySelector(MODAL)) return; // the dialog owns the keyboard
      event.preventDefault(); // also for a held key: the browser's own Ctrl+O / Ctrl+K never opens
      if (!event.repeat) actions[shortcut.action](); // a held key acts once
      return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented && run.isRunning()
      && !document.querySelector(MODAL)) run.stop();
  });
}
