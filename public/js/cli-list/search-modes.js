/**
 * The sidebar search's three modes (the developer's decision, 2026-10-29), each saying what it covers and what it costs:
 * names and folders (instant), the text of the GUI's sessions (the browser already holds it; the default, as before),
 * and the text of every CLI conversation (the server reads every file: on Enter only, within a time budget).
 * The mode is remembered per browser.
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { searchSessions } from '../session-search.js';

const KEY = 'claude-gui.search-mode';
const MODES = [
  { value: 'names', label: 'שמות', explain: 'שמות ותיקיות של כל הסשנים והשיחות. מיידי.' },
  { value: 'open', label: 'תוכן הסשנים', explain: 'גם תוכן הסשנים שבממשק (כבר טעונים בדפדפן). מהיר. שיחות מהטרמינל – לפי שם בלבד.' },
  { value: 'all', label: 'כל השיחות', explain: 'גם תוכן כל שיחות הטרמינל: השרת קורא כל קובץ, ולכן רק ב-Enter ועלול לקחת כמה שניות.' },
];
let server = { query: '', running: false, hits: [], scanned: 0, total: 0, partial: false };
let redraw = () => {};

export function searchMode() {
  try { return MODES.some(mode => mode.value === localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'open'; } catch { return 'open'; }
}

/** Runs the server search for the query in the box (mode "all"); the list shows its hits when it is done. */
async function searchAll(query) {
  server = { ...server, query, running: true, hits: [] };
  redraw();
  try {
    server = { query, running: false, ...(await api.searchCliConversations(query)) };
  } catch (error) {
    server = { query, running: false, hits: [], scanned: 0, total: 0, partial: false, error: error.message };
  }
  redraw();
}

// Enter in mode "all" first runs the server search; the next Enter opens the first result (app.js).
document.getElementById('session-search')?.addEventListener('keydown', event => {
  const query = event.target.value.trim();
  if (event.key !== 'Enter' || searchMode() !== 'all' || !query || server.query === query) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  searchAll(query);
}, true);

/**
 * @param {object[]} sessions GUI sessions listed @param {object[]} rows light rows @param {string} query trimmed
 * @param {()=>void} onChange redraws the list
 * @returns {{results:Map<string,{byName:boolean, content:object|null}>|null, rows:object[]}} results for the GUI
 *   sessions (null: no query); rows: the light rows to show (name matches, plus mode "all"'s hits with their snippet)
 */
export function applySearch(sessions, rows, query, onChange) {
  redraw = onChange;
  if (!query) return { results: null, rows };
  const mode = searchMode();
  const results = searchSessions(sessions, query);
  if (mode === 'names') [...results].forEach(([id, found]) => (found.byName ? results.set(id, { byName: true, content: null }) : results.delete(id)));
  const byName = searchSessions(rows, query);
  const shown = rows.filter(row => byName.has(row.id)).map(row => ({ ...row, content: null }));
  if (mode === 'all' && server.query === query) {
    for (const hit of server.hits) {
      const row = { id: `cli:${hit.id}`, cliId: hit.id, name: hit.title, cwd: hit.cwd, updatedAt: hit.updatedAt, light: true, content: { count: hit.count, snippet: hit.snippet } };
      const at = shown.findIndex(entry => entry.cliId === hit.id);
      if (at >= 0) shown[at] = row; else shown.push(row);
    }
  }
  return { results, rows: shown };
}

/** The mode switch under the search box, with what the chosen mode covers and the server search's progress. */
export function searchModeControl(query, onChange) {
  const mode = searchMode();
  const option = ({ value, label }) => h('button', { type: 'button', class: mode === value ? 'on' : '', 'aria-pressed': String(mode === value),
    onClick: () => { try { localStorage.setItem(KEY, value); } catch { /* storage may be blocked */ } onChange(); } }, label);
  const status = mode !== 'all' || !query ? null
    : server.query !== query ? 'Enter – חיפוש בכל השיחות'
      : server.running ? 'מחפש בכל השיחות…'
        : server.error ? `החיפוש נכשל: ${server.error}`
          : `נסרקו ${server.scanned} מתוך ${server.total} שיחות מהטרמינל${server.stopped === 'hits' ? ' (נעצר: נמצאו 200 שיחות, כדאי לחדד)' : server.stopped === 'time' ? ' (נעצר: הזמן שהוקצב נגמר)' : ''}`;
  return h('div', { class: 'search-modes' },
    h('div', { class: 'grouping-switch', role: 'group', 'aria-label': 'מצב החיפוש' }, MODES.map(option)),
    h('p', { class: 'search-mode-note' }, MODES.find(entry => entry.value === mode).explain, status ? h('b', null, ` ${status}`) : null));
}
