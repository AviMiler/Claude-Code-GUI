/** Making a node of the transcript visible for a search hit: closed groups and rows open; a mode-hidden node cannot be shown. */

/** Opens every closed group or row around a node, so a search hit inside them can be seen. */
export function revealNode(node) {
  for (let parent = node.parentElement?.closest('details'); parent; parent = parent.parentElement?.closest('details')) {
    parent.open = true;
  }
}

/** False for a node the view mode hides (any thinking in Normal): opening its parents would not show it. */
export const canReveal = node => !(node.matches('details.thinking') && node.closest('[data-view="normal"]'));
