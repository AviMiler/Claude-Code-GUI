/**
 * The menu of a file path (an element with data-file-path: the open-file buttons of tool rows and changed-files cards,
 * the file headers of the Changes pane): open in the viewer, copy the full or relative path, add it as an @ reference.
 */
import { copyText } from '../dom.js';
import { toast } from '../ui.js';
import { state } from '../state.js';
import { openFileViewer } from '../file-viewer.js';
import { canOpenInFiles, openInFiles } from '../files/open-in-files.js';
import { openContextMenu, hasSelection } from './menu.js';
import { relativePath } from './paths.js';

/** The session a path belongs to: the split pane's (its element carries the id) or the main one. */
const sessionOf = element => state.sessions.get(element.closest('[data-split-session]')?.dataset.splitSession || state.activeId) || null;

/** @-reference as the CLI reads it: quoted when the path has spaces. */
const reference = path => (/\s/.test(path) ? `@"${path}" ` : `@${path} `);

/**
 * One listener for the whole page. @param {{insert:(text:string)=>void}} composer the main composer (the split pane's
 * small composer has no @ references, so a path there offers no "add")
 */
export function enableFileMenus({ insert }) {
  document.addEventListener('contextmenu', event => {
    const element = event.target.closest('[data-file-path]');
    const session = element && sessionOf(element);
    if (!session || hasSelection()) return;
    event.preventDefault();
    const path = element.dataset.filePath;
    const relative = relativePath(session.cwd, path);
    const inMain = !element.closest('[data-split-session]');
    const copy = async text => { await copyText(text); toast('הנתיב הועתק'); };
    openContextMenu(event, [
      { icon: 'eye', title: 'פתיחה בצופה', onSelect: () => openFileViewer(session.id, path, null) },
      canOpenInFiles(session.id) && !element.closest('[data-split-session]') && { icon: 'pencil', title: 'עריכה בחלונית הקבצים', onSelect: () => openInFiles(session.id, path) },
      { icon: 'copy', title: 'העתקת הנתיב המלא', onSelect: () => copy(path) },
      { icon: 'copy', title: 'העתקת הנתיב היחסי', disabled: !relative, desc: relative ? null : 'מחוץ לתיקיית הסשן', onSelect: () => copy(relative) },
      inMain && { icon: 'at', title: 'הוספה לתיבת הכתיבה (@)', onSelect: () => insert(reference(relative || path)) },
    ].filter(Boolean));
  });
}
