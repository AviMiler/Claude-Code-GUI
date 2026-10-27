/** Page-wide status: the brand spark (busy / waiting) and the tab title with the count of sessions that need the user. */
import { state, activeSession } from './state.js';
import { notifyPreferences } from './notify.js';

/**
 * Updates the brand mark and the tab title from all sessions.
 * @param {HTMLElement} brand the sidebar's brand element (classes `waiting`, `busy` drive animations.css)
 */
export function renderPageStatus(brand) {
  const sessions = [...state.sessions.values()];
  const waiting = sessions.filter(item => item.pendingPermissions?.length).length;
  brand.classList.toggle('waiting', waiting > 0);
  brand.classList.toggle('busy', !waiting && sessions.some(item => item.status === 'running'));
  // Sessions that need the user: waiting for an answer, or finished with an answer not seen yet.
  const attention = sessions.filter(item => item.pendingPermissions?.length || state.unread.has(item.id)).length;
  const count = notifyPreferences().title ? attention : 0;
  const session = activeSession();
  document.title = `${count ? `(${count}) ` : ''}${session ? `${session.name} – ` : ''}Claude Code`;
}

/**
 * An answer that arrived while the tab was hidden counts as seen once the user comes back to the tab.
 * @param {() => void} refresh re-renders the views after the unread mark is cleared
 */
export function watchPageVisibility(refresh) {
  const markActiveSeen = () => {
    if (document.hidden || !state.unread.delete(state.activeId)) return;
    refresh();
  };
  document.addEventListener('visibilitychange', markActiveSeen);
  window.addEventListener('focus', markActiveSeen);
}
