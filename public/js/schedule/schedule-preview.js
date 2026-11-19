/**
 * The always-visible preview of the schedule form: the schedule in words, its next five runs (deferred ones marked
 * "נדחתה") and a warning when it runs very often, or what is wrong. The server computes everything (POST
 * /api/schedules/preview, debounced): there is no second schedule engine in the browser.
 */
import { h } from '../dom.js';
import { badge } from '../panels/kit.js';
import { formatTime } from './schedule-labels.js';

/** Above this many runs on one day the form asks before saving. */
export const BUSY_PER_DAY = 48;

/**
 * @param {{preview:(schedule:object)=>Promise<{text:string, next:number[], delayed?:boolean[], perDay?:number}>}} scheduleApi
 * @param {()=>object} getValue the schedule as the form holds it now
 * @returns {{node:HTMLElement, changed:()=>void, fetch:()=>Promise<object>}} fetch: a fresh preview (throws when invalid)
 */
export function schedulePreview(scheduleApi, getValue) {
  const node = h('div', { class: 'schedule-preview', 'aria-live': 'polite' });
  let timer = null; let asked = 0;

  function draw(result) {
    node.className = 'schedule-preview';
    if (!result.next.length) return node.replaceChildren(h('div', { dir: 'auto' }, `${result.text}: רץ רק ב"הרץ עכשיו".`));
    const runs = result.next.map((time, index) => h('li', null, formatTime(time), result.delayed?.[index] ? badge('נדחתה', 'warning') : null));
    const busy = result.perDay > BUSY_PER_DAY ? h('div', { class: 'schedule-warning' }, `≈ ${result.perDay} הרצות ביום: הרבה מאוד ריצות.`) : null;
    return node.replaceChildren(h('div', { class: 'schedule-summary', dir: 'auto' }, result.text), h('div', { class: 'schedule-next-title' }, 'הריצות הבאות:'), h('ol', { class: 'schedule-next' }, runs), ...(busy ? [busy] : []));
  }

  async function check() {
    const ticket = ++asked;
    try {
      const result = await scheduleApi.preview(getValue());
      if (ticket === asked) draw(result);
    } catch (error) {
      if (ticket !== asked) return;
      node.className = 'schedule-preview invalid';
      node.textContent = error.message;
    }
  }

  return {
    node,
    changed: () => { clearTimeout(timer); timer = setTimeout(check, 250); },
    fetch: () => scheduleApi.preview(getValue()),
  };
}
