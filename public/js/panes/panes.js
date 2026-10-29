/**
 * The workspace panes of the main session: creates the pane host and registers each pane (session details, Changes,
 * Terminal, Files, Plan, Background tasks). app.js talks only to this module.
 */
import { createPaneHost } from './pane-host.js';
import { createDetailsPane } from './pane-details.js';
import { createChangesPane } from './pane-changes.js';
import { createTerminalPane } from '../terminal/terminal-pane.js';
import { createFilesPane } from '../files/files-pane.js';
import { createPlanPane } from '../plan/plan-pane.js';
import { createTasksPane } from '../tasks/tasks-pane.js';

/**
 * @param {{workspace:HTMLElement, area:HTMLElement, modelLabel:(session:object)=>string,
 *   getSession:()=>object|null, send:(text:string)=>Promise<boolean>, onChange:()=>void}} options send: the normal send path
 *   of the main session; onChange: a pane opened or closed
 * @returns {{refresh:()=>void, toggle:(id:string)=>void, open:(id:string)=>void, isOpen:(id:string)=>boolean, closeFocused:()=>void}}
 */
export function createPanes({ workspace, area, modelLabel, getSession, send, onChange }) {
  const host = createPaneHost({ workspace, area, onChange });
  const refresh = () => host.refresh(getSession());
  host.register(createDetailsPane({ openPane: id => host.open(id), modelLabel, rerender: refresh }));
  host.register(createChangesPane({ send, rerender: refresh }));
  host.register(createTerminalPane());
  host.register(createFilesPane({ rerender: refresh, openPane: id => host.open(id) }));
  host.register(createPlanPane());
  host.register(createTasksPane({ rerender: refresh }));
  return { refresh, toggle: host.toggle, open: host.open, isOpen: host.isOpen, closeFocused: host.closeFocused };
}
