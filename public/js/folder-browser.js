/**
 * Folder browser dialog ("Open folder"): walk the disks, filter, create a folder, pick one.
 * The server lists folders only (GET /api/folders); files are never shown here.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { ask, toast } from './ui.js';

const SHOW_HIDDEN_KEY = 'claude-gui.browser-hidden';

/** Path of a sub-folder, with the separator the server uses ("C:\\" already ends with one). */
const join = (folder, name) => {
  const separator = folder.includes('\\') ? '\\' : '/';
  return folder.endsWith(separator) ? `${folder}${name}` : `${folder}${separator}${name}`;
};

/** Breadcrumb parts of a Windows or POSIX path: [{ label, path }]. */
function crumbs(folder) {
  const parts = folder.split(/[\\/]/).filter(Boolean);
  if (/^\\\\/.test(folder)) { // network share: \\server\share is the root
    const [server, share, ...rest] = parts;
    return crumbsFrom(`\\\\${server}\\${share}\\`, `\\\\${server}\\${share}`, rest);
  }
  if (/^[A-Za-z]:/.test(folder)) return crumbsFrom(`${parts[0]}\\`, parts[0], parts.slice(1));
  return crumbsFrom('/', '/', parts);
}

function crumbsFrom(root, rootLabel, parts) {
  const result = [{ label: rootLabel, path: root }];
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    result.push({ label: part, path: current });
  }
  return result;
}

/**
 * Opens the dialog.
 * @param {string} [start] Folder to start in (falls back to the server's default folder).
 * @returns {Promise<string|null>} the chosen folder, or null when cancelled.
 * @example const folder = await pickFolder('C:\\Users\\me'); if (folder) useFolder(folder);
 */
export function pickFolder(start) {
  return new Promise(resolve => {
    let showHidden = false;
    try { showHidden = localStorage.getItem(SHOW_HIDDEN_KEY) === '1'; } catch { /* storage may be blocked */ }
    let current = null; // last listing from the server
    let requestId = 0;

    const pathInput = h('input', { class: 'browser-path', dir: 'ltr', spellcheck: false, 'aria-label': 'נתיב' });
    const filter = h('input', { type: 'search', placeholder: 'סינון…', dir: 'auto', 'aria-label': 'סינון תיקיות' });
    const crumbBar = h('div', { class: 'browser-crumbs', dir: 'ltr' });
    const roots = h('div', { class: 'browser-roots' });
    const listBox = h('div', { class: 'browser-list', role: 'listbox', 'aria-label': 'תיקיות' });
    const status = h('div', { class: 'browser-status', dir: 'auto' });
    const up = h('button', { type: 'button', class: 'icon-button', title: 'תיקייה למעלה (Backspace)' }, icon('arrow-up'));
    const home = h('button', { type: 'button', class: 'icon-button', title: 'תיקיית הבית' }, icon('user'));
    const hidden = h('input', { type: 'checkbox', checked: showHidden });
    const choose = h('button', { type: 'button', class: 'btn primary' }, icon('check'), 'פתיחת התיקייה הזו');
    const dialog = h('dialog', { class: 'confirm folder-browser' },
      h('h2', null, icon('folder'), 'בחירת תיקיית עבודה'),
      h('div', { class: 'browser-bar' }, up, home, pathInput),
      crumbBar, roots, filter, listBox, status,
      h('div', { class: 'card-actions' },
        h('label', { class: 'browser-hidden' }, hidden, 'תיקיות מוסתרות'),
        h('button', { type: 'button', class: 'btn', onClick: () => createFolder() }, icon('plus'), 'תיקייה חדשה'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn ghost', onClick: () => finish(null) }, 'ביטול'),
        choose));

    function finish(result) {
      dialog.close();
      dialog.remove();
      resolve(result);
    }

    function drawList() {
      if (!current) return;
      const needle = filter.value.trim().toLowerCase();
      const folders = current.folders.filter(name => !needle || name.toLowerCase().includes(needle));
      listBox.replaceChildren(...folders.map(name => h('button', {
        type: 'button', class: 'browser-item', dir: 'auto', title: join(current.path, name),
        onClick: () => go(join(current.path, name)),
      }, icon('folder'), h('span', null, name))));
      if (!folders.length) listBox.append(h('div', { class: 'menu-empty' }, needle ? 'אין תיקיות תואמות' : 'אין כאן תת-תיקיות'));
      status.textContent = [current.isRepo ? 'מאגר git' : '', current.truncated ? 'מוצגות 2000 התיקיות הראשונות' : '',
        `${current.folders.length} תיקיות`].filter(Boolean).join(' · ');
    }

    // Explorer's "Copy as path" wraps the path in quotes.
    const cleanPath = text => String(text || '').trim().replace(/^"(.*)"$/, '$1');

    async function go(folder, { firstTry = false } = {}) {
      const id = ++requestId;
      status.textContent = 'טוען…';
      try {
        const listing = await api.folders(cleanPath(folder), showHidden);
        if (id !== requestId) return;
        current = listing;
        status.classList.remove('error');
        pathInput.value = listing.path;
        up.disabled = !listing.parent;
        filter.value = '';
        crumbBar.replaceChildren(...crumbs(listing.path).map((crumb, index) => [
          index ? h('span', { class: 'sep' }, '›') : null,
          h('button', { type: 'button', class: 'crumb', onClick: () => go(crumb.path) }, crumb.label),
        ]).flat().filter(Boolean));
        roots.replaceChildren(...(listing.roots.length > 1 ? listing.roots.map(root => h('button', {
          type: 'button', class: `chip${listing.path.toLowerCase().startsWith(root.toLowerCase()) ? ' on' : ''}`, onClick: () => go(root),
        }, icon('monitor'), root)) : []));
        drawList();
        listBox.scrollTop = 0;
      } catch (error) {
        if (id !== requestId) return;
        // The error stays until the next folder opens: it is the only hint of what went wrong.
        status.textContent = error.message;
        status.classList.add('error');
        if (current) return;
        pathInput.value = cleanPath(folder);
        listBox.replaceChildren(h('div', { class: 'menu-empty', dir: 'auto' }, error.message));
        // The starting folder may not exist (e.g. a typo in the welcome page): open the default/home folder instead.
        if (firstTry && cleanPath(folder)) go('', { firstTry: false });
      }
    }

    async function createFolder() {
      if (!current) return;
      const name = await ask({ title: 'תיקייה חדשה', text: `בתוך ${current.path}`, value: '', placeholder: 'my-project', confirmLabel: 'יצירה' });
      if (!name) return;
      try {
        const created = await api.createFolder(current.path, name);
        toast('התיקייה נוצרה');
        go(created.path);
      } catch (error) {
        toast(error.message, 'error');
      }
    }

    up.addEventListener('click', () => current?.parent && go(current.parent));
    home.addEventListener('click', () => current && go(current.home));
    hidden.addEventListener('change', () => {
      showHidden = hidden.checked;
      try { localStorage.setItem(SHOW_HIDDEN_KEY, showHidden ? '1' : ''); } catch { /* storage may be blocked */ }
      if (current) go(current.path);
    });
    pathInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); go(pathInput.value.trim()); }
    });
    filter.addEventListener('input', drawList);
    filter.addEventListener('keydown', event => {
      // Enter opens the only (or first) match, like typing a name in a file dialog.
      if (event.key === 'Enter') { event.preventDefault(); listBox.querySelector('.browser-item')?.click(); }
      if (event.key === 'Backspace' && !filter.value && current?.parent) { event.preventDefault(); go(current.parent); }
    });
    choose.addEventListener('click', () => current && finish(current.path));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });

    document.body.append(dialog);
    dialog.showModal();
    filter.focus();
    go(start || '', { firstTry: true });
  });
}
