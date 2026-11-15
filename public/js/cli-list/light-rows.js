/**
 * The sidebar's light rows: CLI conversations no GUI session holds (every project folder, lib/transcripts/
 * conversation-index.js), fetched when the list is drawn at most every 30 s and on window focus, never per second.
 * Nothing of one is loaded until it is clicked: then it becomes a session (the import route) and opens.
 */
import { api } from '../api.js';
import { h, folderName } from '../dom.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { state } from '../state.js';
import { searchItems } from '../session-search.js';

const REFRESH_MS = 30000;
let data = { rows: [], total: 0 };
let fetchedAt = 0;
let loading = null;
let redraw = () => {};
const importing = new Set(); // CLI ids being opened: their row is disabled

/** Fetches the rows again on the next draw (a session was deleted: its conversation comes back as a light row). */
export const refreshLightRows = () => { fetchedAt = 0; redraw(); };
window.addEventListener('focus', refreshLightRows);

function load() {
  loading = api.cliConversations()
    .then(next => { const changed = JSON.stringify(next) !== JSON.stringify(data); data = next; if (changed) redraw(); })
    .catch(error => console.error('[light-rows] not loaded:', error.message))
    .finally(() => { fetchedAt = Date.now(); loading = null; });
}

/**
 * @param {Iterable<object>} sessions the GUI sessions (a conversation one of them holds is not a light row)
 * @param {()=>void} onChange redraws the sidebar when new rows arrive
 * @returns {{rows:object[], total:number}} rows shaped like sessions for grouping: { id: 'cli:<id>', cliId, name, cwd, updatedAt, light: true }
 */
export function lightRows(sessions, onChange) {
  redraw = onChange;
  if (!loading && Date.now() - fetchedAt > REFRESH_MS) load();
  const held = new Set([...sessions].flatMap(session => [session.claudeSessionId, ...(session.conversations || [])]));
  const rows = data.rows.filter(row => !held.has(row.id))
    .map(row => ({ id: `cli:${row.id}`, cliId: row.id, name: row.title, cwd: row.cwd, updatedAt: row.updatedAt, light: true }));
  return { rows, total: data.total };
}

/** Makes the conversation a session and opens it; with a search, the opened session's matches are marked. */
async function open(row, query, onSelect) {
  if (importing.has(row.cliId)) return;
  importing.add(row.cliId);
  redraw();
  try {
    const session = await api.importTranscript(row.cwd, row.cliId, state.draft?.mode);
    state.sessions.set(session.id, session);
    const found = query ? searchItems(session.items || [], query) : null;
    onSelect(session.id, found ? { indexes: found.indexes, query } : undefined);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    importing.delete(row.cliId);
    redraw();
  }
}

/**
 * @param {object} row from lightRows (or a search hit shaped like one)
 * @param {{inProjectGroup:boolean, snippet:HTMLElement|null, query:string, onSelect:Function}} options
 * @returns {HTMLElement}
 */
export function lightRowNode(row, { inProjectGroup, snippet, query, onSelect }) {
  const button = h('button', {
    type: 'button', class: 'session-row light', disabled: importing.has(row.cliId),
    title: `${row.cwd}\nשיחה מהטרמינל – תיפתח כסשן בלחיצה`, onClick: () => open(row, query, onSelect),
  }, h('span', { class: 'light-icon', 'aria-hidden': 'true' }, icon('terminal')),
  h('span', null, h('strong', { dir: 'auto' }, row.name), inProjectGroup ? null : h('small', { dir: 'auto' }, folderName(row.cwd)), snippet));
  return h('div', { class: 'session-item light', dataset: { cliId: row.cliId } }, button);
}

/** "Showing the newest 500 of N" when the cap cut the list. @returns {HTMLElement|null} */
export const capNotice = (shown, total) => (total > shown
  ? h('div', { class: 'group-title muted' }, `מוצגות ${shown} השיחות האחרונות מהטרמינל מתוך ${total}`) : null);
