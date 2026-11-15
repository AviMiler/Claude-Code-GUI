/**
 * A conversation item of the automatic check (lib/verify/verify-hook.js): a failed attempt (a notice: Claude goes on
 * fixing, the same turn) or the last allowed failure (an error: Claude stopped). The check's output tail is collapsed.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';

/** @param {{kind:'notice'|'error', text:string, verify:{tail:string, exitCode:number|null}}} item @returns {HTMLElement} */
export function renderVerifyItem(item) {
  const failed = item.kind === 'error';
  const exit = item.verify.exitCode === null || item.verify.exitCode === undefined ? '' : ` (קוד יציאה ${item.verify.exitCode})`;
  return h('div', { class: `verify-item${failed ? ' error-card' : ' notice'}`, dir: 'auto' },
    icon('alert'),
    h('div', { class: 'verify-body' },
      h('span', null, item.text),
      h('details', { class: 'verify-tail' }, h('summary', null, `סוף הפלט של הבדיקה${exit}`), h('pre', { dir: 'ltr' }, item.verify.tail || ''))));
}
