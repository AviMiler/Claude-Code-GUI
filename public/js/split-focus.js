/**
 * Which pane has the focus when the split view is open: the one the user last clicked or typed in (Claude Desktop).
 * The focused pane gets a top line in the accent colour and the other is slightly dimmed (css/split.css, via
 * `data-focus` on the app element). A plain click on a sidebar session replaces the session of the focused pane.
 * With no split there is one pane, always the main one, and nothing is marked.
 */

/**
 * @param {{app:HTMLElement, main:HTMLElement, pane:HTMLElement, onFocus:()=>void}} options main: the main pane's element
 *   (topbar and chat); pane: the split pane; onFocus: the focus moved (the sidebar marks follow)
 * @returns {{where:()=>'main'|'split', set:(where:'main'|'split')=>void, marks:(activeId:string|null, splitId:string|null)=>object,
 *   sidebarClick:(id:string, view:object)=>boolean, closeFocused:(view:object)=>void}}
 */
export function createSplitFocus({ app, main, pane, onFocus }) {
  let current = 'main';
  const isOpen = () => app.classList.contains('split');
  const where = () => (isOpen() ? current : 'main');

  function set(next) {
    const changed = next !== current;
    current = next;
    if (isOpen()) app.dataset.focus = current; else delete app.dataset.focus;
    if (changed) onFocus();
  }

  // Capture: a pane's own handlers (a button that stops the event) must not hide where the user is working.
  for (const [element, side] of [[main, 'main'], [pane, 'split']]) {
    for (const type of ['pointerdown', 'focusin']) element.addEventListener(type, () => { if (isOpen()) set(side); }, true);
  }

  return {
    where,
    set,
    /** The sessions the sidebar marks: the focused pane's (primary) and the other visible one. */
    marks(activeId, splitId) {
      if (!splitId) return { focusedId: activeId, alsoId: null };
      return where() === 'split' ? { focusedId: splitId, alsoId: activeId } : { focusedId: activeId, alsoId: splitId };
    },
    /**
     * A plain click on a sidebar session. @param {{activeId:string|null, splitId:string|null, openInSplit:(id:string)=>void}} view
     * @returns {boolean} true when handled here; false when the caller opens it in the main pane
     */
    sidebarClick(id, { activeId, splitId, openInSplit }) {
      if (id === splitId) { set('split'); return true; } // already visible: just focus it (never in both panes)
      if (where() !== 'split') return false;
      if (id === activeId) { set('main'); return true; }
      openInSplit(id);
      return true;
    },
    /**
     * Ctrl+Alt+W: closes the focused pane. The split pane just closes; closing the main pane promotes the split pane's session.
     * @param {{splitId:string|null, closeSplit:()=>void, selectMain:(id:string)=>void}} view
     */
    closeFocused({ splitId, closeSplit, selectMain }) {
      if (!isOpen()) return;
      const closingMain = where() === 'main';
      closeSplit();
      if (closingMain && splitId) selectMain(splitId);
    },
  };
}

/** Sets the sidebar rows' marks: aria-current on the focused session's row, `also-open` on the other visible one. */
export function markSessionRows(container, { focusedId, alsoId }) {
  for (const item of container.querySelectorAll('.session-item[data-session-id]')) {
    const row = item.querySelector('.session-row');
    if (!row) continue;
    row.setAttribute('aria-current', String(item.dataset.sessionId === focusedId));
    row.classList.toggle('also-open', Boolean(alsoId) && item.dataset.sessionId === alsoId);
  }
}
