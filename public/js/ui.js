/** Toasts, confirm/prompt dialogs, and the light/dark theme. */
import { h } from './dom.js';

const THEME_KEY = 'claude-gui.theme';
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

/** @param {string} message @param {'info'|'error'} [type] */
export function toast(message, type = 'info') {
  let root = document.querySelector('.toasts');
  if (!root) { root = h('div', { class: 'toasts', role: 'status' }); document.body.append(root); }
  const node = h('div', { class: `toast ${type}`, dir: 'auto' }, message);
  root.append(node);
  setTimeout(() => node.remove(), type === 'error' ? 6000 : 3200);
}

/**
 * Modal question. Resolves with true/false, or with the typed text (null when cancelled) if `value` is given.
 * @param {{title:string, text?:string, value?:string, placeholder?:string, confirmLabel?:string, danger?:boolean}} options
 * @returns {Promise<boolean|string|null>}
 */
export function ask({ title, text, value, placeholder, confirmLabel = 'אישור', danger = false }) {
  return new Promise(resolve => {
    const input = value !== undefined ? h('input', { value, placeholder: placeholder || '', dir: 'auto' }) : null;
    const dialog = h('dialog', { class: 'confirm' });
    const finish = result => { dialog.close(); dialog.remove(); resolve(result); };
    const ok = () => finish(input ? input.value.trim() : true);
    dialog.append(...[h('h2', null, title), text ? h('p', { dir: 'auto' }, text) : null, input,
      h('div', { class: 'card-actions' },
        h('button', { type: 'button', class: 'btn ghost', onClick: () => finish(input ? null : false) }, 'ביטול'),
        h('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'}`, onClick: ok }, confirmLabel))].filter(Boolean));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(input ? null : false); });
    input?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); ok(); } });
    document.body.append(dialog);
    dialog.showModal();
    (input || dialog.querySelector('.btn.primary, .btn.danger')).focus();
  });
}

export function themePreference() {
  try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; }
}

/** @param {'system'|'light'|'dark'} [preference] */
export function applyTheme(preference = themePreference()) {
  try { localStorage.setItem(THEME_KEY, preference); } catch { /* storage may be blocked */ }
  const dark = preference === 'dark' || (preference === 'system' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

darkQuery.addEventListener('change', () => applyTheme());
