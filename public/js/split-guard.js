/** Split view helpers: the browser's remembered choices and the minimum window width (1000 px) a split needs. */
import { toast } from './ui.js';

const NARROW = matchMedia('(max-width: 1000px)');

export const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ } };
export const recall = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
export const isNarrow = () => NARROW.matches;

/** @returns {boolean} true (after saying why) when the window is too narrow to open a split */
export function refuseWhenNarrow() {
  if (!NARROW.matches) return false;
  toast('החלון צר מדי לפיצול. הרחב אותו ונסה שוב.');
  return true;
}

/** @param {()=>void} callback called when the window becomes narrower than the minimum */
export function onTooNarrow(callback) {
  // The media query's change event alone is not reliable (an emulated or throttled window may skip it): watching the page's size is the net.
  const check = () => { if (NARROW.matches) callback(); };
  NARROW.addEventListener('change', check);
  new ResizeObserver(check).observe(document.documentElement);
}
