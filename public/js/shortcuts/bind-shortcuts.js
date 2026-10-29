/** Page-wide keyboard shortcuts (shortcut-list.js names them); the composer, the panes and the dialogs handle their own keys. */
import { shortcutFor } from './shortcut-list.js';
import { toggleShortcutsDialog } from './shortcuts-dialog.js';

/**
 * @param {{slashMenu, newSession, toggleSidebar, settings, cycleView, toggleChanges, toggleTerminal, closePane, toggleSplit, stop,
 *   isRunning:()=>boolean}} run what each action of the table does (isRunning: Esc stops only a running turn);
 *   the Ctrl+/ dialog is this folder's own
 * @example bindShortcuts({ slashMenu: () => composer.insert('/'), ... })
 */
export function bindShortcuts(run) {
  const actions = { ...run, shortcuts: toggleShortcutsDialog };
  document.addEventListener('keydown', event => {
    const shortcut = shortcutFor(event);
    if (shortcut) {
      event.preventDefault(); // also for a held key: the browser's own Ctrl+O / Ctrl+K never opens
      if (!event.repeat) actions[shortcut.action](); // a held key acts once
      return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented && run.isRunning()
      && !document.querySelector('.modal-backdrop, .popover, dialog[open]')) run.stop();
  });
}
