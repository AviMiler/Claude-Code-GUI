/**
 * Every keyboard shortcut of the GUI, in one table: the page-wide handler (bind-shortcuts.js), the Ctrl+/ dialog and the
 * help panel all read it. An entry with `action` is handled page-wide; one without is handled where it lives (the
 * composer, the Changes pane) and is listed here only so it shows in the lists.
 */

/** @typedef {{keys:string, label:string, group:string, action?:string, code?:string, shift?:boolean}} Shortcut */

export const SHORTCUT_GROUPS = [
  { id: 'general', label: 'כללי' },
  { id: 'conversation', label: 'שיחה' },
  { id: 'panes', label: 'חלוניות' },
  { id: 'composer', label: 'תיבת הכתיבה' },
];

/** @type {Shortcut[]} code: the physical key (event.code), so a shortcut works on any keyboard layout (Hebrew included) */
export const SHORTCUTS = [
  { keys: 'Ctrl+Shift+O', label: 'סשן חדש', group: 'general', action: 'newSession', code: 'KeyO', shift: true },
  { keys: 'Ctrl+K', label: 'תפריט פקודות', group: 'general', action: 'slashMenu', code: 'KeyK' },
  { keys: 'Ctrl+B', label: 'הצגת/הסתרת הסרגל', group: 'general', action: 'toggleSidebar', code: 'KeyB' },
  { keys: 'Ctrl+,', label: 'הגדרות', group: 'general', action: 'settings', code: 'Comma' },
  { keys: 'Ctrl+/', label: 'קיצורי מקלדת', group: 'general', action: 'shortcuts', code: 'Slash' },
  { keys: 'Shift+F10', label: 'תפריט הקשר של סשן או קובץ (גם קליק ימני)', group: 'general' },
  { keys: 'Ctrl+O', label: 'החלפת תצוגת התמליל (רגילה, חשיבה, מפורטת)', group: 'conversation', action: 'cycleView', code: 'KeyO' },
  { keys: 'Esc', label: 'עצירת Claude (או סגירת תפריט)', group: 'conversation' },
  { keys: 'Ctrl+Shift+D', label: 'חלונית השינויים', group: 'panes', action: 'toggleChanges', code: 'KeyD', shift: true },
  { keys: 'Ctrl+\\', label: 'סגירת החלונית הממוקדת', group: 'panes', action: 'closePane', code: 'Backslash' },
  { keys: 'Ctrl+Shift+\\', label: 'פיצול תצוגה: סשן נוסף לצד זה', group: 'panes', action: 'toggleSplit', code: 'Backslash', shift: true },
  { keys: 'Ctrl+Enter', label: 'שליחת ההערות על השינויים (בחלונית השינויים)', group: 'panes' },
  { keys: 'Enter', label: 'שליחה (בזמן ש-Claude עובד: תיקון שנכנס לתור הנוכחי)', group: 'composer' },
  { keys: 'Alt+Enter', label: 'בזמן ש-Claude עובד: לתור, תישלח כשיסיים', group: 'composer' },
  { keys: 'Shift+Enter', label: 'שורה חדשה', group: 'composer' },
  { keys: '/', label: 'פקודות ו-Skills', group: 'composer' },
  { keys: '@', label: 'קבצים, תיקיות וסוכנים', group: 'composer' },
  { keys: 'Shift+Tab', label: 'החלפת מצב הרשאות (שאל → עריכות → תכנון)', group: 'composer' },
  { keys: '↑', label: 'הודעה קודמת (בתיבה ריקה)', group: 'composer' },
];

/** The page-wide shortcut a keydown means, or null. Ctrl or Cmd, never Alt; Shift must match exactly. */
export function shortcutFor(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  return SHORTCUTS.find(item => item.action && item.code === event.code && Boolean(item.shift) === event.shiftKey) || null;
}
