/** /help: every slash command grouped as in the menu, and the keyboard shortcuts. */
import { h } from '../dom.js';
import { GROUPS } from '../command-catalog.js';
import { section, kv, loading } from './kit.js';

const SHORTCUTS = [
  ['Enter', 'שליחה'], ['Shift+Enter', 'שורה חדשה'], ['/', 'תפריט פקודות'], ['@', 'קבצים, תיקיות וסוכנים'],
  ['Shift+Tab', 'החלפת מצב הרשאות (שאל → עריכות → תכנון)'], ['Esc', 'עצירת Claude / סגירת תפריט'],
  ['↑ בתיבה ריקה', 'הודעה קודמת'], ['Ctrl+K', 'תפריט פקודות'], ['Ctrl+Shift+O', 'סשן חדש'], ['Ctrl+B', 'הצגת/הסתרת הסרגל'], ['Ctrl+,', 'הגדרות'],
];

export async function renderHelpPanel(body, context) {
  body.append(loading());
  const commands = await context.getCommands();
  body.replaceChildren(section('קיצורי מקלדת', null, kv(SHORTCUTS)));
  for (const group of GROUPS) {
    const inGroup = commands.filter(command => command.group === group.id);
    if (!inGroup.length) continue;
    body.append(section(`${group.label} (${inGroup.length})`, group.id === 'terminal' ? 'חלק מהן אינטראקטיביות בטרמינל בלבד; שם המקבילה בממשק (אם יש) מופיע בתיאור.' : null,
      h('div', { class: 'help-grid' }, inGroup.map(command => h('button', {
        type: 'button', class: 'help-cmd', title: command.cliDescription || command.description,
        onClick: () => { context.close(); context.insert(`/${command.name}${command.argHint ? ' ' : ''}`); },
      }, h('code', { dir: 'ltr' }, `/${command.name}${command.aliases.length ? `  (${command.aliases.map(alias => `/${alias}`).join(', ')})` : ''}`),
      h('span', { dir: 'auto' }, command.description))))));
  }
}
