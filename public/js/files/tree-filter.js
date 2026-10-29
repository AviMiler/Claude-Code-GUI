/** The Files pane's filter box: files of the session folder by name (the same search as the composer's @ menu). */
import { api } from '../api.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

/**
 * @param {{getSessionId:()=>string, onResults:(paths:string[]|null)=>void}} handlers onResults gets null when the box is empty (show the tree)
 * @returns {{node:HTMLElement, reset:()=>void}}
 */
export function createTreeFilter({ getSessionId, onResults }) {
  const input = h('input', { type: 'search', class: 'tree-filter', dir: 'auto', placeholder: 'חיפוש קובץ…', 'aria-label': 'חיפוש קובץ' });
  let timer = 0;
  let latest = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (!query) { latest += 1; onResults(null); return; }
    timer = setTimeout(async () => {
      const mine = ++latest;
      const paths = await api.files({ sessionId: getSessionId() }, query).catch(() => []);
      if (mine === latest) onResults(paths.filter(path => !path.endsWith('/')));
    }, 150);
  });
  return { node: h('div', { class: 'tree-filter-box' }, icon('search'), input), reset() { input.value = ''; latest += 1; } };
}
