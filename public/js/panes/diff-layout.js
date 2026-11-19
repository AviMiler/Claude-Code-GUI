/**
 * The Changes pane's layout choice: unified or side by side. The choice is per browser (localStorage); side by side
 * only applies while the pane is wide enough, otherwise the diff stays unified and the toggle says why it is disabled.
 */
import { SPLIT_MIN_WIDTH } from './diff-split.js';

const KEY = 'claude-gui.diff-layout';

function stored() {
  try { return localStorage.getItem(KEY) === 'split' ? 'split' : 'unified'; } catch { return 'unified'; }
}

/**
 * @param {()=>void} onChange called after a click and when the pane crosses the width limit (the toggle or the diff changes)
 * @returns {{observe:(element:HTMLElement)=>void, isSplit:()=>boolean, canSplit:()=>boolean, choose:(layout:string)=>void}}
 */
export function createDiffLayout(onChange) {
  let preference = stored();
  let wide = false;
  let observed = null;
  const isSplit = () => preference === 'split' && wide;
  return {
    observe(element) {
      if (observed === element || typeof ResizeObserver !== 'function') return;
      observed = element;
      new ResizeObserver(([entry]) => {
        const width = entry.contentRect.width;
        const next = width >= SPLIT_MIN_WIDTH;
        if (width > 0 && next !== wide) { wide = next; onChange(); } // a hidden pane (0 px) keeps its state
      }).observe(element);
    },
    isSplit, canSplit: () => wide,
    choose(layout) {
      preference = layout === 'split' ? 'split' : 'unified';
      try { localStorage.setItem(KEY, preference); } catch { /* the choice lasts until the page closes */ }
      onChange();
    },
  };
}
