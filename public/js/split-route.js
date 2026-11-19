/**
 * Where a "/" line typed in the split pane's composer goes. The pane's session is not the active one, so a GUI command
 * (/clear, /fork, a panel...) would act on the wrong session: only /btw (the side question tab of THIS session) and
 * commands that go to the CLI as text are handled in the pane; the rest ask for the main pane.
 */
import { parseSlash, findCommand } from './command-catalog.js';

/**
 * @typedef {{kind:'send'}|{kind:'side', question:string}|{kind:'blocked', name:string}} SplitRoute
 */

/**
 * @param {{name:string, run:string}} command a catalog entry (command-catalog.js)
 * @param {string} args the text after the command's name
 * @returns {SplitRoute} side: open the side question tab (an empty question just focuses its input)
 */
export function routeCommand(command, args = '') {
  if (command.name === 'btw') return { kind: 'side', question: args.trim() };
  return command.run === 'send' ? { kind: 'send' } : { kind: 'blocked', name: command.name };
}

/**
 * @param {string} text what was typed
 * @param {object[]} commands the pane session's commands (state.js getCommands)
 * @returns {SplitRoute} a line that is not a known command is an ordinary message
 */
export function routeSplitInput(text, commands) {
  if (/^\s*!\S/.test(text)) return { kind: 'blocked', name: '!' }; // "!ls" runs in the main pane only (main-composer.js)
  const slash = parseSlash(text);
  const command = slash && findCommand(commands, slash.name);
  return command ? routeCommand(command, slash.args) : { kind: 'send' };
}
