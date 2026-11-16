/**
 * Collapses the top bar's pane buttons into their single "חלוניות" overflow button when the bar has no room for them,
 * and back when it has. Measured after every top bar render and whenever the bar changes size.
 */
const watched = new WeakSet();

/** @param {HTMLElement} bar the top bar holding a `.pane-toggles` group (pane-toggles.js) */
export function fitPaneToggles(bar) {
  if (!watched.has(bar)) {
    watched.add(bar);
    new ResizeObserver(() => fitPaneToggles(bar)).observe(bar);
  }
  const group = bar.querySelector('.pane-toggles');
  if (!group || !bar.clientWidth) return;
  group.classList.remove('collapsed');
  // The bar has no room when its content runs past it (its items do not shrink below their content width).
  if (bar.scrollWidth > bar.clientWidth + 1) group.classList.add('collapsed');
}
