/** Hebrew words of the scheduled-task screens: run outcomes, times and durations. */
import { badge } from '../panels/kit.js';

const OUTCOMES = {
  starting: ['מתחיל…', 'info'], running: ['רץ עכשיו', 'info'], waiting: ['ממתין לאישור', 'warning'], done: ['הסתיים', 'success'],
  error: ['נכשל', 'danger'], stopped: ['נעצר', 'warning'], 'no-approval': ['נעצר: אין אישור', 'danger'], stalled: ['נעצרה: תקועה', 'danger'], skipped: ['דולג', ''],
};

/** @param {{outcome:string, catchUp?:boolean, manual?:boolean, stalled?:boolean}} run @returns {HTMLElement[]} badges */
export function runBadges(run) {
  const [label, tone] = OUTCOMES[run.outcome] || [run.outcome, ''];
  return [badge(label, tone), run.catchUp ? badge('השלמה', 'accent') : null, run.manual ? badge('ידני', '') : null,
    run.stalled ? badge('נתקע', 'warning') : null].filter(Boolean);
}

/** @param {number|null} time ms @returns {string} "יום ב׳ 16.11 09:00" */
export function formatTime(time) {
  if (!time) return '—';
  return new Date(time).toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** @param {number} ms @returns {string} */
export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} שנ׳`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} דק׳` : `${Math.floor(minutes / 60)} שע׳ ${minutes % 60} דק׳`;
}

/** Warning next to a permission mode in the task form ('' when none). */
export function modeWarning(mode) {
  if (mode === 'bypassPermissions') return 'זהירות: המשימה תפעל בלי לשאול אף פעם – כל פקודה, עריכה ומחיקה יבוצעו מעצמן, גם כשאיש לא ליד המחשב.';
  if (mode === 'default' || mode === 'plan') return 'במצב הזה ריצה נעצרת וממתינה כשהיא צריכה אישור. אם איש לא מאשר בזמן, היא תיעצר.';
  return '';
}
