/**
 * Runs a slash command: GUI actions and panels locally, everything else as text to the CLI.
 * See commands-data.js for which command runs where.
 */
import { toast } from './ui.js';

/**
 * @param {object} actions Session actions from actions.js plus openPanel/insert/send.
 * @returns {(command:object, args:string, options?:{fromMenu?:boolean})=>Promise<void>}
 */
export function createCommandRunner(actions) {
  const withArgs = (name, args) => `/${name}${args ? ` ${args}` : ''}`;

  const ACTIONS = {
    clear: () => actions.clear(),
    model: args => (args ? actions.updateSettings({ model: args === 'default' ? '' : args }) : actions.openPanel('model')),
    effort: args => (args ? actions.updateSettings({ effort: args === 'auto' ? '' : args }) : actions.openPanel('model')),
    'output-style': args => (args ? actions.updateSettings({ outputStyle: args === 'default' ? '' : args }) : actions.openPanel('model')),
    plan: async args => { await actions.setMode('plan'); if (args) await actions.send(args); },
    mcp: args => (args ? actions.send(withArgs('mcp', args)) : actions.openPanel('mcp')),
    config: args => (args ? actions.send(withArgs('config', args)) : actions.openPanel('settings')),
    'reload-plugins': () => actions.control('reload_plugins', 'הפלאגינים נטענו מחדש'),
    'reload-skills': () => actions.control('reload_skills', 'ה-Skills נטענו מחדש'),
    rename: args => actions.rename(args),
    export: args => actions.exportChat(args),
    copy: args => actions.copyLast(Number(args) || 1),
    'add-dir': args => (args ? actions.addDir(args) : actions.openPanel('model')),
    fork: () => actions.fork(),
    focus: args => actions.toggleFocus(args === 'on' ? true : args === 'off' ? false : undefined),
    theme: () => actions.openPanel('appearance'),
    stop: () => actions.stop(),
    btw: args => actions.sideQuestion(args),
  };

  return async function run(command, args = '', { fromMenu = false } = {}) {
    const [kind, target] = command.run.split(':');
    try {
      if (kind === 'panel') return actions.openPanel(target);
      if (kind === 'action') return await ACTIONS[target](args);
      if (kind === 'terminal') {
        toast(`/${command.name} זמינה רק בממשק הטרמינל של Claude Code (${command.description}).`);
        return undefined;
      }
      // Sent to the CLI. From the menu, a command that needs an argument is put in the box first.
      if (fromMenu && /^</.test(command.argHint)) return actions.insert(`/${command.name} `, { replace: true });
      return await actions.send(withArgs(command.name, args));
    } catch (error) {
      console.error(`[command-runner] /${command.name} failed:`, error);
      toast(error.message, 'error');
      return undefined;
    }
  };
}
