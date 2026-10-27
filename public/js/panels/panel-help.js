/** /help: every slash command grouped as in the menu, and the keyboard shortcuts. */
import { h } from '../dom.js';
import { GROUPS } from '../command-catalog.js';
import { section, kv, loading } from './kit.js';
import { SHORTCUTS } from '../shortcuts/shortcut-list.js';

export async function renderHelpPanel(body, context) {
  body.append(loading());
  const commands = await context.getCommands();
  // The keys are Latin: left to right inside the RTL panel, or "Ctrl+\\" reads "\\+Ctrl".
  const rows = SHORTCUTS.map(item => [h('span', { dir: 'ltr' }, item.keys), item.label]);
  const lead = [h('span', { dir: 'ltr' }, 'Ctrl+/'), ' פותח אותם בחלון מכל מקום'];
  body.replaceChildren(section('קיצורי מקלדת', lead, kv(rows)));
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
