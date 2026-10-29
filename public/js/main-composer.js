/** The main composer's behaviour: a "/" command runs in the GUI or goes to Claude, the queue, mode cycling and the chip menus. */
import { createComposer } from './composer.js';
import { activeSession, getCommands } from './state.js';
import { findCommand, parseSlash } from './command-catalog.js';
import { createChipMenus } from './chip-menus.js';
import { warmUp } from './warm-up.js';
import { toast } from './ui.js';
import { bangCommand, runBang } from './terminal/shell-command.js';
import { createShellNote } from './terminal/shell-note.js';
import { enableRewind } from './rewind/rewind-menu.js';

/**
 * @param {HTMLElement} area the composer's container
 * @param {{actions:object, runCommand:Function}} deps actions.js and command-runner.js
 * @returns {ReturnType<typeof createComposer>} the composer, whose update also redraws the line about `!` commands
 */
export function createMainComposer(area, { actions, runCommand }) {
  const composer = createComposer(area, {
    // delivery: while Claude works, Enter corrects the running turn and Alt+Enter queues (composer.js).
    async onSubmit(text, attachments = [], { delivery } = {}) {
      if (attachments.length) return actions.send(text, attachments, delivery); // with attachments it is a message to Claude, never a GUI command
      const bang = bangCommand(text); // "!ls": a shell command in the session's folder, run at once even while Claude works
      if (bang !== null) return runBang(bang, { report: error => toast(error.message, 'error'), say: toast });
      const slash = parseSlash(text);
      const command = slash && findCommand(await getCommands(), slash.name);
      if (command && command.run !== 'send') { await runCommand(command, slash.args); return true; }
      return actions.send(text, [], delivery);
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
  enableRewind({ restore: entries => composer.restore(entries) });
  const note = createShellNote();
  area.prepend(note.node);
  const showNote = () => note.update(activeSession(), composer.textarea.value);
  composer.textarea.addEventListener('input', showNote);
  return { ...composer, update(args) { composer.update(args); showNote(); } };
}
