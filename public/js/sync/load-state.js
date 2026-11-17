/**
 * Loads the whole state (first connect, or the server's `resync`): every session's metadata, the config and the CLI's
 * capabilities. Items are not in it (lazy, sync/item-sync.js): the ones this tab already holds are kept, and the
 * sessions on screen fetch what they missed (or everything, when the server's revision changed).
 */
import { api } from '../api.js';
import { state, getModels } from '../state.js';
import { chooseDraftFolder } from '../folder-defaults.js';
import { setGroups } from '../sidebar/groups-store.js';

const ACTIVE_KEY = 'claude-gui.active-session';

/** Remembers the open session for the next load. @param {string|null} id */
export function rememberActive(id) {
  try { localStorage.setItem(ACTIVE_KEY, id || ''); } catch { /* storage may be blocked */ }
}

/**
 * @param {{versionLabel:HTMLElement, selectSession:(id:string|null)=>void, refresh:()=>void, itemSync:object}} view
 * @returns {()=>Promise<void>}
 */
export function createStateLoader({ versionLabel, selectSession, refresh, itemSync }) {
  return async function loadState() {
    const { sessions, config, capabilities, sidebarGroups } = await api.state();
    setGroups(sidebarGroups); // the sidebar's custom groups (also after a resync)
    const held = state.sessions;
    state.sessions = new Map(sessions.map(session => {
      const old = held.get(session.id);
      return [session.id, { items: [], ...(old?.itemsRev && { items: old.items, itemsRev: old.itemsRev }), ...session }];
    }));
    state.config = config;
    state.capabilities = capabilities;
    if (!state.draft.cwd) chooseDraftFolder(config.defaultCwd); // with the folder's remembered mode, model and effort
    versionLabel.textContent = capabilities.version ? `Claude Code ${capabilities.version}` : 'Claude Code לא זוהה';
    if (capabilities.error) versionLabel.title = capabilities.error;
    let remembered = null;
    try { remembered = localStorage.getItem(ACTIVE_KEY); } catch { /* storage may be blocked */ }
    itemSync.connected(); // subscribe to the sessions on screen and fetch what they missed
    selectSession(state.activeId || remembered); // a session that comes on screen now is loaded by its refresh (watch)
    getModels().then(refresh).catch(() => {});
  };
}
