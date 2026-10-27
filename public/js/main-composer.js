/** The main composer's behaviour: a "/" command runs in the GUI or goes to Claude, the queue, mode cycling and the chip menus. */
import { createComposer } from './composer.js';
import { activeSession, getCommands } from './state.js';
import { findCommand, parseSlash } from './command-catalog.js';
import { createChipMenus } from './chip-menus.js';
import { warmUp } from './warm-up.js';

/**
 * @param {HTMLElement} area the composer's container
 * @param {{actions:object, runCommand:Function}} deps actions.js and command-runner.js
 * @returns {ReturnType<typeof createComposer>}
 */
export function createMainComposer(area, { actions, runCommand }) {
  const composer = createComposer(area, {
    async onSubmit(text, attachments = []) {
      if (attachments.length) return actions.send(text, attachments); // with attachments it is a message to Claude, never a GUI command
      const slash = parseSlash(text);
      const command = slash && findCommand(await getCommands(), slash.name);
      if (command && command.run !== 'send') { await runCommand(command, slash.args); return true; }
      return actions.send(text);
    },
    onStop: () => actions.stop(),
    onQueueRemove: entry => actions.removeQueued(entry),
    onQueueEdit: entry => actions.editQueued(entry),
    onQueueResume: () => actions.resumeQueue(),
    onCommand: command => runCommand(command, '', { fromMenu: true }),
    onCycleMode: () => actions.cycleMode(),
    onContext: () => actions.openPanel('usage'),
    getHistory: () => (activeSession()?.items || []).filter(item => item.kind === 'user').map(item => item.text),
    onTyping: () => warmUp(),
    ...createChipMenus({ actions, getComposer: () => composer }),
  });
  return composer;
}
