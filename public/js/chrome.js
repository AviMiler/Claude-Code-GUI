/** Top bar of the thread and the welcome page shown before a session exists. */
import { h, folderName, copyText } from './dom.js';
import { icon } from './icons.js';
import { crab } from './crab.js';
import { showDropdown } from './popover.js';
import { recentFolders } from './state.js';
import { toast } from './ui.js';
import { pickFolder } from './folder-browser.js';
import { viewModeEntries } from './transcript/view-mode.js';
import { toggleShortcutsDialog } from './shortcuts/shortcuts-dialog.js';
import { createWorktreeToggle } from './worktree/worktree-toggle.js';
import { projectFolder } from './worktree/project-folder.js';

const SUGGESTIONS = [
  { command: '/init', text: 'יצירת CLAUDE.md שמתעד את הפרויקט' },
  { command: '/resume', text: 'המשך שיחה קודמת מהתיקייה' },
  { command: '/mcp', text: 'שרתי MCP: סטטוס, כלים והוספה' },
  { command: '/skills', text: 'Skills זמינים ויצירת Skill חדש' },
  { command: '/agents', text: 'סוכני משנה (subagents)' },
  { command: '/help', text: 'כל הפקודות וקיצורי המקלדת' },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'לילה טוב';
  if (hour < 12) return 'בוקר טוב';
  if (hour < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

/**
 * @param {HTMLElement} bar
 * @param {object|null} session
 * @param {{onToggleSidebar, onRename, onOpenPanel, onFork, onClear, onExport, onFocus, onDelete, onPin, onSplit, onToggleDetails,
 *   detailsOpen:boolean, onToggleChanges, changesOpen:boolean, viewMode:()=>string, onViewMode, onArchive, onUnarchive, onNewSession}}
 *   handlers detailsOpen / changesOpen: that pane is open (its toggle shows pressed); viewMode: the transcript's current mode
 */
export function renderTopbar(bar, session, handlers) {
  const toggle = h('button', { type: 'button', class: 'icon-button', title: 'סרגל צד (Ctrl+B)', onClick: handlers.onToggleSidebar }, icon('sidebar'));
  if (!session) {
    bar.replaceChildren(toggle, h('strong', { style: 'font-size:15px' }, 'סשן חדש'), h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'icon-button', title: 'הגדרות (Ctrl+,)', onClick: () => handlers.onOpenPanel('model') }, icon('settings')));
    return;
  }
  const title = h('input', { class: 'title-input', value: session.name, dir: 'auto', 'aria-label': 'שם הסשן', size: Math.max(8, Math.min(session.name.length + 2, 48)) });
  // An emptied title keeps the old name (an empty one would open the rename dialog instead).
  title.addEventListener('change', () => { if (title.value.trim()) handlers.onRename(title.value.trim()); else title.value = session.name; });
  title.addEventListener('keydown', event => { if (event.key === 'Enter') title.blur(); });
  const copyChip = (iconName, label, path, title) => h('button', { type: 'button', class: 'chip', title: `${title}\n(לחיצה מעתיקה את הנתיב)`,
    onClick: async () => { await copyText(path); toast('הנתיב הועתק'); } }, icon(iconName), h('span', { class: 'label', dir: 'auto' }, label));
  const folder = copyChip('folder', folderName(projectFolder(session)), projectFolder(session), projectFolder(session));
  // A session in its own worktree (worktree/): its branch beside the project folder, like Desktop.
  const tree = session.worktree;
  const branch = tree ? copyChip('branch', tree.branch, tree.path, `ענף ${tree.branch}\nworktree: ${tree.path}`) : null;
  // An archived session opens as usual (archive/); sending a message also brings it back.
  const archived = session.archived ? h('button', { type: 'button', class: 'chip archived-chip', title: 'הסשן בארכיון. שליחת הודעה תחזיר אותו לרשימה.',
    onClick: handlers.onUnarchive }, icon('archive'), 'בארכיון · שחזור') : null;
  const extra = (session.addDirs || []).length ? h('span', { class: 'chip', title: session.addDirs.join('\n') }, `+${session.addDirs.length} תיקיות`) : null;
  const agent = session.agent ? h('span', { class: 'chip', title: 'הסוכן הראשי של הסשן' }, icon('bot'), session.agent) : null;
  const runningTasks = (session.tasks || []).filter(task => task.status === 'running').length;
  const tasks = runningTasks ? h('button', { type: 'button', class: 'chip tasks-chip', title: 'משימות רקע (/tasks)',
    onClick: () => handlers.onOpenPanel('tasks') }, icon('loader', 'spinning'), `${runningTasks} ברקע`) : null;
  const more = h('button', { type: 'button', class: 'icon-button', title: 'עוד' }, icon('more'));
  more.addEventListener('click', () => showDropdown(more, [
    ...viewModeEntries(session, handlers.viewMode(), handlers.onViewMode),
    { section: 'סשן' },
    { icon: 'pencil', title: 'שינוי שם', hint: '/rename', onSelect: () => handlers.onRename() },
    { icon: 'pin', title: session.pinned ? 'ביטול הצמדה' : 'הצמדה למעלה בסרגל', disabled: Boolean(session.archived), onSelect: handlers.onPin },
    session.archived ? { icon: 'history', title: 'שחזור מהארכיון', onSelect: handlers.onUnarchive }
      : { icon: 'archive', title: 'העברה לארכיון', onSelect: handlers.onArchive },
    { icon: 'panel-right', title: handlers.detailsOpen ? 'הסתרת פרטי הסשן' : 'הצגת פרטי הסשן', onSelect: handlers.onToggleDetails },
    { icon: 'branch', title: 'ענף חדש מהשיחה', hint: '/fork', onSelect: handlers.onFork },
    { icon: 'refresh', title: 'שיחה חדשה (ניקוי הקשר)', hint: '/clear', onSelect: handlers.onClear },
    { icon: 'download', title: 'ייצוא ל-Markdown', hint: '/export', onSelect: handlers.onExport },
    { icon: 'focus', title: 'תצוגה ממוקדת', hint: '/focus', onSelect: handlers.onFocus },
    { icon: 'history', title: 'שיחות קודמות', hint: '/resume', onSelect: () => handlers.onOpenPanel('resume') },
    { icon: 'help', title: 'קיצורי מקלדת', hint: 'Ctrl+/', onSelect: toggleShortcutsDialog },
    { icon: 'trash', title: 'מחיקת הסשן', onSelect: handlers.onDelete },
  ], { placement: 'bottom' }));
  bar.replaceChildren(...[toggle, title, folder, branch, archived, extra, agent, tasks, h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'icon-button', title: 'פיצול תצוגה: סשן נוסף לצד זה (Ctrl+Shift+\\)', onClick: handlers.onSplit }, icon('columns')),
    h('button', { type: 'button', class: `icon-button${handlers.changesOpen ? ' on' : ''}`, 'aria-pressed': String(handlers.changesOpen),
      title: 'שינויים (Ctrl+Shift+D)', onClick: handlers.onToggleChanges }, icon('diff')),
    h('button', { type: 'button', class: 'icon-button', title: 'הקשר ושימוש (/context)', onClick: () => handlers.onOpenPanel('usage') }, icon('gauge')),
    h('button', { type: 'button', class: 'icon-button', title: 'הגדרות (Ctrl+,)', onClick: () => handlers.onOpenPanel('model') }, icon('settings')),
    h('button', { type: 'button', class: `icon-button${handlers.detailsOpen ? ' on' : ''}`, 'aria-pressed': String(handlers.detailsOpen),
      title: handlers.detailsOpen ? 'הסתרת פרטי הסשן' : 'הצגת פרטי הסשן', onClick: handlers.onToggleDetails }, icon('panel-right', 'mirror')),
    more].filter(Boolean));
}

/**
 * @param {HTMLElement} container
 * @param {{cwd:string, defaultCwd:string, onFolder:(cwd:string)=>void, onSuggestion:(command:string)=>void}} options
 */
export function renderWelcome(container, { cwd, defaultCwd, onFolder, onSuggestion }) {
  const input = h('input', { value: cwd || defaultCwd, dir: 'ltr', 'aria-label': 'תיקיית עבודה', placeholder: defaultCwd, spellcheck: false });
  const worktree = createWorktreeToggle(() => input.value.trim() || defaultCwd);
  const chooseFolder = folder => { onFolder(folder); worktree.update(); };
  input.addEventListener('change', () => chooseFolder(input.value.trim()));
  const browse = h('button', { type: 'button', class: 'btn small', title: 'עיון בתיקיות המחשב' }, icon('folder'), 'עיון…');
  browse.addEventListener('click', async () => {
    const folder = await pickFolder(input.value.trim() || defaultCwd);
    if (!folder) return;
    input.value = folder;
    chooseFolder(folder);
  });
  const recents = recentFolders().filter(folder => folder !== input.value);
  container.replaceChildren(...[
    crab(),
    h('h1', null, `${greeting()}, במה נעבוד היום?`),
    h('p', null, 'בחר תיקיית עבודה וכתוב משימה. Claude Code יעבוד בתיקייה הזו.'),
    h('div', { class: 'folder-picker' }, icon('folder'), input, browse),
    worktree.node,
    recents.length ? h('div', { class: 'recent-folders' }, recents.map(folder => h('button', {
      type: 'button', class: 'chip', title: folder, onClick: () => { input.value = folder; chooseFolder(folder); },
    }, icon('history'), h('span', { class: 'label' }, folderName(folder))))) : null,
    h('div', { class: 'suggestions' }, SUGGESTIONS.map(item => h('button', {
      type: 'button', class: 'suggestion', onClick: () => onSuggestion(item.command),
    }, h('b', null, item.command), item.text))),
  ].filter(Boolean));
}
