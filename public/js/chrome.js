/** Top bar of the thread and the welcome page shown before a session exists. */
import { h, folderName, copyText } from './dom.js';
import { icon } from './icons.js';
import { showDropdown } from './popover.js';
import { recentFolders } from './state.js';
import { toast } from './ui.js';
import { pickFolder } from './folder-browser.js';

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
 * @param {{onToggleSidebar, onRename, onOpenPanel, onFork, onClear, onExport, onFocus, onDelete, onPin, onSplit, onNewSession}} handlers
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
  const folder = h('button', { type: 'button', class: 'chip', title: `${session.cwd}\n(לחיצה מעתיקה את הנתיב)`,
    onClick: async () => { await copyText(session.cwd); toast('הנתיב הועתק'); } }, icon('folder'), h('span', { class: 'label' }, folderName(session.cwd)));
  const extra = (session.addDirs || []).length ? h('span', { class: 'chip', title: session.addDirs.join('\n') }, `+${session.addDirs.length} תיקיות`) : null;
  const agent = session.agent ? h('span', { class: 'chip', title: 'הסוכן הראשי של הסשן' }, icon('bot'), session.agent) : null;
  const runningTasks = (session.tasks || []).filter(task => task.status === 'running').length;
  const tasks = runningTasks ? h('button', { type: 'button', class: 'chip tasks-chip', title: 'משימות רקע (/tasks)',
    onClick: () => handlers.onOpenPanel('tasks') }, icon('loader', 'spinning'), `${runningTasks} ברקע`) : null;
  const more = h('button', { type: 'button', class: 'icon-button', title: 'עוד' }, icon('more'));
  more.addEventListener('click', () => showDropdown(more, [
    { icon: 'pencil', title: 'שינוי שם', hint: '/rename', onSelect: () => handlers.onRename() },
    { icon: 'pin', title: session.pinned ? 'ביטול הצמדה' : 'הצמדה למעלה בסרגל', onSelect: handlers.onPin },
    { icon: 'branch', title: 'ענף חדש מהשיחה', hint: '/fork', onSelect: handlers.onFork },
    { icon: 'refresh', title: 'שיחה חדשה (ניקוי הקשר)', hint: '/clear', onSelect: handlers.onClear },
    { icon: 'download', title: 'ייצוא ל-Markdown', hint: '/export', onSelect: handlers.onExport },
    { icon: 'focus', title: 'תצוגה ממוקדת', hint: '/focus', onSelect: handlers.onFocus },
    { icon: 'history', title: 'שיחות קודמות', hint: '/resume', onSelect: () => handlers.onOpenPanel('resume') },
    { icon: 'trash', title: 'מחיקת הסשן', onSelect: handlers.onDelete },
  ], { placement: 'bottom' }));
  bar.replaceChildren(...[toggle, title, folder, extra, agent, tasks, h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'icon-button', title: 'פיצול תצוגה: סשן נוסף לצד זה (Ctrl+\\)', onClick: handlers.onSplit }, icon('columns')),
    h('button', { type: 'button', class: 'icon-button', title: 'שינויים ב-git (/diff)', onClick: () => handlers.onOpenPanel('diff') }, icon('diff')),
    h('button', { type: 'button', class: 'icon-button', title: 'הקשר ושימוש (/context)', onClick: () => handlers.onOpenPanel('usage') }, icon('gauge')),
    h('button', { type: 'button', class: 'icon-button', title: 'הגדרות (Ctrl+,)', onClick: () => handlers.onOpenPanel('model') }, icon('settings')),
    more].filter(Boolean));
}

/**
 * @param {HTMLElement} container
 * @param {{cwd:string, defaultCwd:string, onFolder:(cwd:string)=>void, onSuggestion:(command:string)=>void}} options
 */
export function renderWelcome(container, { cwd, defaultCwd, onFolder, onSuggestion }) {
  const input = h('input', { value: cwd || defaultCwd, dir: 'ltr', 'aria-label': 'תיקיית עבודה', placeholder: defaultCwd, spellcheck: false });
  input.addEventListener('change', () => onFolder(input.value.trim()));
  const browse = h('button', { type: 'button', class: 'btn small', title: 'עיון בתיקיות המחשב' }, icon('folder'), 'עיון…');
  browse.addEventListener('click', async () => {
    const folder = await pickFolder(input.value.trim() || defaultCwd);
    if (!folder) return;
    input.value = folder;
    onFolder(folder);
  });
  const recents = recentFolders().filter(folder => folder !== input.value);
  container.replaceChildren(...[
    icon('spark', 'big spark claude-mark'),
    h('h1', null, `${greeting()}, במה נעבוד היום?`),
    h('p', null, 'בחר תיקיית עבודה וכתוב משימה. Claude Code יעבוד בתיקייה הזו.'),
    h('div', { class: 'folder-picker' }, icon('folder'), input, browse),
    recents.length ? h('div', { class: 'recent-folders' }, recents.map(folder => h('button', {
      type: 'button', class: 'chip', title: folder, onClick: () => { input.value = folder; onFolder(folder); },
    }, icon('history'), h('span', { class: 'label' }, folderName(folder))))) : null,
    h('div', { class: 'suggestions' }, SUGGESTIONS.map(item => h('button', {
      type: 'button', class: 'suggestion', onClick: () => onSuggestion(item.command),
    }, h('b', null, item.command), item.text))),
  ].filter(Boolean));
}
