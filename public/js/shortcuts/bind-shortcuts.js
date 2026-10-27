/** Page-wide keyboard shortcuts; the composer, the panes and the dialogs handle their own keys. */

/**
 * @param {{slashMenu, newSession, toggleSidebar, settings, toggleSplit, toggleChanges, cycleView, stop, isRunning:()=>boolean}} run
 *   what each shortcut does (isRunning: Esc stops only a running turn)
 * @example bindShortcuts({ slashMenu: () => composer.insert('/'), ... })
 */
export function bindShortcuts(run) {
  document.addEventListener('keydown', event => {
    const mod = event.ctrlKey || event.metaKey;
    const key = (event.key || '').toLowerCase(); // synthetic keydowns (autofill) have no key
    const act = action => { event.preventDefault(); action(); };
    if (mod && key === 'k') act(run.slashMenu);
    else if (mod && event.shiftKey && key === 'o') act(run.newSession);
    // event.code: the same physical key on any keyboard layout (O is ם on a Hebrew one); a held key cycles once.
    else if (mod && !event.shiftKey && !event.altKey && event.code === 'KeyO') { event.preventDefault(); if (!event.repeat) run.cycleView(); }
    else if (mod && key === 'b') act(run.toggleSidebar);
    else if (mod && event.key === ',') act(run.settings);
    else if (mod && event.key === '\\') act(run.toggleSplit);
    else if (mod && event.shiftKey && event.code === 'KeyD') act(run.toggleChanges);
    else if (event.key === 'Escape' && !event.defaultPrevented && run.isRunning()
      && !document.querySelector('.modal-backdrop, .popover, dialog[open]')) run.stop();
  });
}
