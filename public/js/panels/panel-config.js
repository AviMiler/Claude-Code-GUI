/** /hooks, /memory and /config: hook listing, CLAUDE.md files, and the raw settings files. */
import { h } from '../dom.js';
import { section, list, row, badge, button, load, empty, tabs, kv, isUnsupported, readAllSettings } from './kit.js';
import { fileEditor } from './file-editor.js';

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'PreCompact', 'SessionStart', 'SessionEnd']
  .map(name => ({ name }));

/** Older CLIs lack get_hooks_listing; then hooks are read from the settings files ({ Event: [{ matcher, hooks }] }). */
async function fetchHooks(context) {
  try {
    return await context.api.control(context.scope, 'get_hooks_listing');
  } catch (error) {
    if (!isUnsupported(error)) throw error;
    const files = await readAllSettings(context);
    const hooks = files.flatMap(({ source, settings }) => Object.entries(settings.hooks || {}).flatMap(([event, groups]) =>
      (Array.isArray(groups) ? groups : []).flatMap(group => (group.hooks || []).map(hook => ({ event, matcher: group.matcher, source, ...hook })))));
    return { hooks, eventCatalog: HOOK_EVENTS };
  }
}

export function renderHooksPanel(body, context) {
  const box = h('div');
  body.append(box);
  load(box, () => fetchHooks(context), listing => {
    const hooks = listing.hooks || [];
    return [
      section('Hooks מוגדרים', 'פקודות ש-Claude Code מריץ באירועים. מוגדרים בקובצי ההגדרות (לשונית "קובצי הגדרות").',
        hooks.length ? list(hooks.map(hook => row({
          title: h('span', null, hook.event || hook.hookEventName || 'hook'),
          badges: [hook.matcher ? badge(hook.matcher, 'info') : null, hook.source ? badge(hook.source) : null, hook.type ? badge(hook.type) : null].filter(Boolean),
          sub: hook.command || hook.prompt || JSON.stringify(hook), mono: true,
        }))) : empty('אין hooks מוגדרים')),
      section('אירועים זמינים', null, list((listing.eventCatalog || []).map(event => row({
        title: h('code', { dir: 'ltr' }, event.name), badges: event.supportsMatcher ? [badge('matcher')] : [], sub: event.summary,
      })))),
      button('עריכת קובץ ההגדרות', () => context.open('settings'), { iconName: 'settings', small: false }),
    ];
  });
}

const MEMORY_KINDS = [
  { kind: 'memory-project', label: 'הוראות פרויקט', hint: './CLAUDE.md – משותף לצוות' },
  { kind: 'memory-local', label: 'הוראות פרויקט אישיות', hint: './CLAUDE.local.md – רק אצלך' },
  { kind: 'memory-user', label: 'הוראות משתמש', hint: '~/.claude/CLAUDE.md – בכל הפרויקטים' },
];

/** Older CLIs (2.1.246) lack get_memory_dialog; then the auto memory folder is read from disk (its on/off state stays unknown). */
async function fetchMemoryDialog(context) {
  try {
    return await context.api.control(context.scope, 'get_memory_dialog');
  } catch (error) {
    if (!isUnsupported(error)) throw error;
    const { autoMemory } = await context.api.claudeFiles(context.scope);
    return { fromDisk: true, folders: [{ label: 'תיקיית הזיכרון', path: autoMemory.exists ? autoMemory.path : `${autoMemory.path} (לא קיימת)` }], memories: autoMemory.files };
  }
}

export function renderMemoryPanel(body, context) {
  const editorBox = h('div');
  const infoBox = h('div');
  const files = h('div', { class: 'radio-cards' });
  const open = item => editorBox.replaceChildren(fileEditor(context, {
    title: item.label, kind: item.kind, template: '# הוראות ל-Claude\n\n- ', onSaved: () => context.rerender(),
  }));
  context.api.claudeFiles(context.scope).then(all => {
    const exists = new Map(all.memory.map(file => [file.kind, file]));
    files.replaceChildren(...MEMORY_KINDS.map(item => h('button', { type: 'button', class: 'radio-card', onClick: () => open(item) },
      h('span'), h('b', null, item.label), exists.get(item.kind)?.exists ? badge('קיים', 'success') : badge('לא נוצר'),
      h('span', { dir: 'ltr' }, exists.get(item.kind)?.path || item.hint))));
  }).catch(error => context.toast(error.message, 'error'));
  body.append(section('קובצי CLAUDE.md', 'הוראות קבועות ש-Claude קורא בתחילת כל שיחה. בחר קובץ לעריכה.', files,
    h('div', { class: 'panel-toolbar', style: 'margin-top:10px' },
      button('יצירה אוטומטית עם /init', () => { context.close(); context.send('/init'); }, { iconName: 'file-plus' }))), editorBox, infoBox);
  load(infoBox, () => fetchMemoryDialog(context), dialog => section('זיכרון אוטומטי',
    dialog.fromDisk ? 'נקרא מהדיסק: גרסת Claude Code הזו לא מדווחת על הזיכרון האוטומטי ישירות.' : null, kv([
    ['זיכרון אוטומטי', dialog.auto_memory?.status || (dialog.fromDisk ? 'לא ידוע' : '—')],
    ...(dialog.folders || []).map(folder => [folder.label, folder.path]),
    ['זיכרונות שמורים', String((dialog.memories || []).length)],
  ])));
}

const SETTINGS_TABS = [
  { id: 'settings-local', label: 'פרויקט – מקומי' }, { id: 'settings-project', label: 'פרויקט – משותף' },
  { id: 'settings-user', label: 'משתמש' }, { id: 'effective', label: 'הגדרות בפועל' },
];
let settingsTab = 'settings-local';

export function renderSettingsPanel(body, context) {
  const strip = h('div');
  const content = h('div');
  const show = tab => {
    settingsTab = tab;
    strip.replaceChildren(tabs(SETTINGS_TABS, tab, show));
    if (tab === 'effective') {
      return load(content, () => context.api.control(context.scope, 'get_settings'), settings => [
        section('ההגדרות ש-Claude Code משתמש בהן עכשיו', 'מיזוג של כל המקורות (מדיניות ארגון, משתמש, פרויקט, מקומי, דגלים).',
          h('pre', { class: 'output-pre' }, JSON.stringify(settings.effective || settings, null, 2))),
        settings.applied ? section('בסשן הזה', null, h('pre', { class: 'output-pre' }, JSON.stringify(settings.applied, null, 2))) : null,
      ]);
    }
    content.replaceChildren(fileEditor(context, { title: SETTINGS_TABS.find(item => item.id === tab).label, kind: tab, json: true, template: '{\n}\n' }));
    return undefined;
  };
  body.append(section(null, 'עריכה ישירה של settings.json: הרשאות, hooks, env, model, outputStyle ועוד. שינויים חלים בהודעה הבאה.'), strip, content);
  show(settingsTab);
}
