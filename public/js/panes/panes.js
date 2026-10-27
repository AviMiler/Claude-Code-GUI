/**
 * The workspace panes of the main session: creates the pane host and registers each pane (session details now;
 * Changes, Terminal, Files, Plan and Background tasks plug in here). app.js talks only to this module.
 */
import { createPaneHost } from './pane-host.js';
import { createDetailsPane } from './pane-details.js';

/**
 * @param {{workspace:HTMLElement, area:HTMLElement, openPanel:(id:string)=>void, modelLabel:(session:object)=>string,
 *   getSession:()=>object|null}} options
 * @returns {{refresh:()=>void, toggle:(id:string)=>void, isOpen:(id:string)=>boolean, closeFocused:()=>void}}
 */
export function createPanes({ workspace, area, openPanel, modelLabel, getSession }) {
  const host = createPaneHost({ workspace, area });
  const refresh = () => host.refresh(getSession());
  host.register(createDetailsPane({ openPanel, modelLabel, rerender: refresh }));
  return { refresh, toggle: host.toggle, isOpen: host.isOpen, closeFocused: host.closeFocused };
}
