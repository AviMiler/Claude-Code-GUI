/** Permission modes and effort levels offered in the UI. Mode values must match VALID_MODES in lib/session-service.js. */
export const MODES = [
  { value: 'default', label: 'שאל לפני פעולות', short: 'שואל', icon: 'hand',
    description: 'Claude מבקש אישור לפני עריכת קבצים והרצת פקודות. הבקשות מופיעות מעל תיבת הכתיבה.' },
  { value: 'acceptEdits', label: 'אישור עריכות אוטומטי', short: 'עורך קבצים', icon: 'pencil',
    description: 'עריכת קבצים מותרת בלי לשאול. פקודות אחרות עדיין דורשות אישור.' },
  { value: 'plan', label: 'מצב תכנון', short: 'תכנון', icon: 'map',
    description: 'קריאה בלבד: Claude חוקר ומציע תוכנית, ואתה מאשר אותה לפני שינויים.' },
  { value: 'auto', label: 'מצב אוטומטי', short: 'אוטומטי', icon: 'zap',
    description: 'מסווג בטיחות מחליט מה לאשר. דורש גרסה ותוכנית שתומכות בכך.' },
  { value: 'dontAsk', label: 'אל תשאל (דחה)', short: 'לא שואל', icon: 'lock',
    description: 'כל מה שהיה דורש אישור נדחה אוטומטית. מתאים להרצה בלי השגחה.' },
  { value: 'bypassPermissions', label: 'הכול מותר', short: 'ללא הגבלות', icon: 'alert',
    description: 'אין בדיקות הרשאה בכלל, כולל הרצת פקודות. רק בתיקייה שאתה סומך עליה.' },
];

/** Shift+Tab cycles through these, like in the terminal. */
export const MODE_CYCLE = ['default', 'acceptEdits', 'plan'];

export const EFFORT_LEVELS = [
  { value: '', label: 'ברירת מחדל' }, { value: 'low', label: 'נמוך' }, { value: 'medium', label: 'בינוני' },
  { value: 'high', label: 'גבוה' }, { value: 'xhigh', label: 'גבוה מאוד' }, { value: 'max', label: 'מקסימום' },
];

/**
 * Modes the installed CLI accepts (2.1.x lists "manual" for "default").
 * @param {string[]} cliModes From capabilities.permissionModes.
 */
export function availableModes(cliModes = []) {
  if (!cliModes.length) return MODES;
  return MODES.filter(mode => cliModes.includes(mode.value) || (mode.value === 'default' && cliModes.includes('manual')));
}

export const modeInfo = value => MODES.find(mode => mode.value === value) || MODES[0];
