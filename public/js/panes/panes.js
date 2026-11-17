/**
 * The workspace panes of the main session: creates the pane host and registers each pane (session details, Changes,
 * Terminal, Files, Plan, Background tasks, Preview). app.js talks only to this module.
 */
import { createPaneHost } from './pane-host.js';
import { createDetailsPane } from './pane-details.js';
import { createChangesPane } from './pane-changes.js';
import { createTerminalPane } from '../terminal/terminal-pane.js';
import { createFilesPane } from '../files/files-pane.js';
import { createPlanPane } from '../plan/plan-pane.js';
import { createTasksPane } from '../tasks/tasks-pane.js';
import { createSidePane } from '../side/side-pane.js';
import { createPreviewPane } from '../preview/preview-pane.js';

/**
 * @param {{workspace:HTMLElement, area:HTMLElement, modelLabel:(session:object)=>string,
 *   getSession:()=>object|null, send:(text:string)=>Promise<boolean>, onChange:()=>void}} options send: the normal send path
 *   of the main session; onChange: a pane opened or closed
 * @returns {{refresh:()=>void, toggle:(id:string)=>void, open:(id:string)=>void, isOpen:(id:string)=>boolean,
 *   isActive:(id:string)=>boolean, closeFocused:()=>void, side:{ask:Function, focusInput:Function}}} side: the side question tab
 */
export function createPanes({ workspace, area, modelLabel, getSession, send, onChange }) {
  const host = createPaneHost({ workspace, area, onChange });
  const refresh = () => host.refresh(getSession());
  host.register(createDetailsPane({ openPane: id => host.open(id), modelLabel, rerender: refresh }));
  host.register(createChangesPane({ send, rerender: refresh }));
  host.register(createTerminalPane({ rerender: refresh, openPane: id => host.open(id) }));
  host.register(createFilesPane({ rerender: refresh, openPane: id => host.open(id) }));
  host.register(createPlanPane());
  host.register(createTasksPane({ rerender: refresh }));
  host.register(createPreviewPane({ rerender: refresh, openPane: id => host.open(id) }));
  const side = createSidePane({ open: id => host.open(id), isActive: host.isActive, rerender: onChange }); // onChange redraws the top bar (its dot)
  host.register(side.pane);
  return { refresh, toggle: host.toggle, open: host.open, isOpen: host.isOpen, isActive: host.isActive, closeFocused: host.closeFocused, side };
}
