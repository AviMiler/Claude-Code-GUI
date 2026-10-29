/** Which Windows shell runs the commands (cmd or PowerShell), remembered per browser. Elsewhere there is one shell, so no choice. */
import { h } from '../dom.js';

const KEY = 'claude-gui.shell';
const isWindows = /Windows/i.test(navigator.userAgent);

/** The shell name to send (undefined: the server's default, the only shell outside Windows). */
export function currentShell() {
  if (!isWindows) return undefined;
  try { return localStorage.getItem(KEY) === 'powershell' ? 'powershell' : 'cmd'; } catch { return 'cmd'; }
}

/** @returns {{node:HTMLElement|null, get:()=>string|undefined}} the selector (null outside Windows) and the chosen shell */
export function shellChoice() {
  if (!isWindows) return { node: null, get: () => undefined };
  let value = currentShell();
  const select = h('select', { class: 'shell-select', title: 'סוג ה-shell', 'aria-label': 'סוג ה-shell' },
    h('option', { value: 'cmd' }, 'cmd'), h('option', { value: 'powershell' }, 'PowerShell'));
  select.value = value;
  select.addEventListener('change', () => { value = select.value; try { localStorage.setItem(KEY, value); } catch { /* storage may be blocked */ } });
  return { node: select, get: () => value };
}
