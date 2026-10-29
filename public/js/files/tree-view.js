/** The Files pane's folder tree: one level is fetched when a folder is opened, and a click on a file opens it. */
import { api } from '../api.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

const key = (sessionId, dir, hidden) => `${sessionId}|${hidden ? 1 : 0}|${dir}`;

/**
 * @param {{onChange:()=>void}} handlers onChange: a listing arrived (draw again)
 * @returns {{rows:(session:object, state:object, onOpen:(path:string)=>void)=>HTMLElement[], refresh:(sessionId:string)=>void}}
 */
export function createTreeView({ onChange }) {
  const listings = new Map(); // key -> { entries, truncated } | { error } | 'loading'

  function listing(session, state, dir) {
    const id = key(session.id, dir, state.showHidden);
    if (!listings.has(id)) {
      listings.set(id, 'loading');
      api.treeDir(session.id, dir, state.showHidden)
        .then(result => listings.set(id, result), error => listings.set(id, { error: error.message }))
        .finally(onChange);
    }
    return listings.get(id);
  }

  function rows(session, state, onOpen, dir = '', depth = 0) {
    const found = listing(session, state, dir);
    const pad = { style: `padding-inline-start:${6 + depth * 14}px` };
    if (found === 'loading') return [h('div', { class: 'tree-note', ...pad }, 'טוען…')];
    if (found.error) return [h('div', { class: 'tree-note error', ...pad }, found.error)];
    const out = found.entries.flatMap(entry => {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.type === 'file') {
        return [h('button', { type: 'button', class: 'tree-row', title: entry.blocked ? 'קישור אל מחוץ לתיקיות הסשן' : path, disabled: Boolean(entry.blocked), ...pad,
          onClick: () => onOpen(path) }, icon('file'), h('span', { class: 'tree-name', dir: 'ltr' }, entry.name))];
      }
      const open = state.expanded.has(path) && !entry.blocked;
      const row = h('button', { type: 'button', class: 'tree-row dir', 'aria-expanded': String(open), disabled: Boolean(entry.blocked), title: entry.blocked ? 'קישור אל מחוץ לתיקיות הסשן' : path, ...pad,
        onClick: () => { if (!state.expanded.delete(path)) state.expanded.add(path); onChange(); } },
      icon('chevron-down', `chevron${open ? '' : ' collapsed'}`), icon('folder'), h('span', { class: 'tree-name', dir: 'ltr' }, entry.name));
      return [row, ...(open ? rows(session, state, onOpen, path, depth + 1) : [])];
    });
    if (found.truncated) out.push(h('div', { class: 'tree-note', ...pad }, 'יש עוד פריטים. השתמש בחיפוש.'));
    if (!out.length) out.push(h('div', { class: 'tree-note', ...pad }, 'התיקייה ריקה'));
    return out;
  }

  return {
    rows: (session, state, onOpen) => rows(session, state, onOpen),
    refresh: sessionId => { for (const id of [...listings.keys()]) if (id.startsWith(`${sessionId}|`)) listings.delete(id); onChange(); },
  };
}
