/** Transcript view modes (Claude Code Desktop): Normal, Thinking, Verbose — remembered per session in this browser. */

const MODES_KEY = 'claude-gui.transcript-view';
const MAX_REMEMBERED = 300;

/** @typedef {'normal'|'thinking'|'verbose'} ViewMode */
const VIEW_MODES = [
  { value: 'normal', label: 'רגילה', description: 'קריאות לכלים מקופלות לסיכום, התשובות במלואן' },
  { value: 'thinking', label: 'חשיבה', description: 'כמו רגילה, ובנוסף החשיבה של Claude' },
  { value: 'verbose', label: 'מפורטת', description: 'כל קריאה לכלי, כל קובץ שנקרא וכל שלב, וגם החשיבה' },
];

/** @param {ViewMode} mode @returns {string} its Hebrew name (the Ctrl+O toast) */
export const viewModeLabel = mode => VIEW_MODES.find(item => item.value === mode)?.label || mode;

function saved() {
  try { return JSON.parse(localStorage.getItem(MODES_KEY) || '{}') || {}; } catch { return {}; }
}

/** Thinking is offered only after Claude produced thinking in the session (like Desktop); a subagent's own does not count. */
const hasThinking = session => (session?.items || []).some(item => item.kind === 'thinking' && !item.parent && item.text?.trim());

/** @param {object|null} session @returns {ViewMode} the session's mode; Thinking falls back to Normal while there is none */
export function viewModeOf(session) {
  const mode = session ? saved()[session.id] : null;
  if (mode === 'thinking' && !hasThinking(session)) return 'normal';
  return VIEW_MODES.some(item => item.value === mode) ? mode : 'normal';
}

/** @param {string} sessionId @param {ViewMode} mode */
export function saveViewMode(sessionId, mode) {
  const all = saved();
  delete all[sessionId];
  all[sessionId] = mode; // newest last, so the oldest are dropped first
  const kept = Object.entries(all).slice(-MAX_REMEMBERED);
  try { localStorage.setItem(MODES_KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* storage may be blocked */ }
}

/**
 * The "עוד" menu's view section (popover.js entries): the current mode checked; Thinking disabled until there is some.
 * @param {object} session @param {ViewMode} current @param {(mode:ViewMode)=>void} onSelect @returns {object[]}
 */
export function viewModeEntries(session, current, onSelect) {
  return [{ section: 'תצוגת תמליל (Ctrl+O)' }, ...VIEW_MODES.map(item => ({
    icon: 'eye', title: item.label, desc: item.description, checked: item.value === current,
    disabled: item.value === 'thinking' && !hasThinking(session), onSelect: () => onSelect(item.value),
  }))];
}

/**
 * The next mode for Ctrl+O, skipping Thinking while the session has none.
 * @param {object} session @param {ViewMode} current the mode on screen (not the saved one: storage may be blocked)
 * @returns {ViewMode}
 */
export function nextViewMode(session, current) {
  const offered = VIEW_MODES.filter(item => item.value !== 'thinking' || hasThinking(session));
  const at = offered.findIndex(item => item.value === current);
  return offered[(at + 1) % offered.length].value;
}
