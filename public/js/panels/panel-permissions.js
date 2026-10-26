/** /permissions: permission mode plus allow / ask / deny rules, edited in the settings files. */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { availableModes } from '../modes.js';
import { section, list, row, badge, button, field, select, load, empty, isUnsupported, readAllSettings } from './kit.js';

const BEHAVIORS = [{ value: 'allow', label: 'לאפשר (allow)' }, { value: 'ask', label: 'לשאול (ask)' }, { value: 'deny', label: 'לחסום (deny)' }];
const DESTINATIONS = [
  { value: 'settings-local', label: 'פרויקט – מקומי (.claude/settings.local.json)', source: 'localSettings' },
  { value: 'settings-project', label: 'פרויקט – משותף (.claude/settings.json)', source: 'projectSettings' },
  { value: 'settings-user', label: 'משתמש (~/.claude/settings.json)', source: 'userSettings' },
];
const TONES = { allow: 'success', ask: 'warning', deny: 'danger' };

/** Adds or removes one rule in a settings file, keeping everything else in it. */
async function editRule(context, kind, behavior, rule, remove) {
  const file = await context.api.readClaudeFile(context.fileScope, kind);
  const settings = file.content.trim() ? JSON.parse(file.content) : {};
  settings.permissions ??= {};
  const rules = new Set(settings.permissions[behavior] || []);
  if (remove) rules.delete(rule); else rules.add(rule);
  settings.permissions[behavior] = [...rules];
  await context.api.writeClaudeFile(context.fileScope, kind, undefined, `${JSON.stringify(settings, null, 2)}\n`);
}

export function renderPermissionsPanel(body, context) {
  const { session } = context;
  const currentMode = session?.mode || context.draft.mode;
  body.append(section('מצב הרשאות', 'אפשר גם להחליף מהשבב בתיבת הכתיבה, או עם Shift+Tab.',
    h('div', { class: 'radio-cards' }, availableModes(context.capabilities.permissionModes).map(mode => h('button', {
      type: 'button', class: `radio-card${mode.value === currentMode ? ' on' : ''}`,
      onClick: async () => { await context.updateSession({ mode: mode.value }); context.rerender(); },
    }, icon(mode.icon), h('b', null, mode.label), h('code', { dir: 'ltr' }, mode.value), h('span', null, mode.description))))));

  const rulesBox = h('div');
  const ruleInput = h('input', { placeholder: 'Bash(npm test:*)  ·  Read(./secrets/**)  ·  WebFetch(domain:example.com)  ·  mcp__server', dir: 'ltr' });
  const behaviorSelect = select(BEHAVIORS, 'allow');
  const destinationSelect = select(DESTINATIONS, 'settings-local');
  // Older CLIs lack list_permission_rules; then the rules are read from the settings files directly.
  const fetchRules = () => context.api.control(context.scope, 'list_permission_rules').catch(async error => {
    if (!isUnsupported(error)) throw error;
    const files = await readAllSettings(context);
    const rules = files.flatMap(({ source, settings }) => BEHAVIORS.flatMap(({ value }) =>
      (settings.permissions?.[value] || []).map(rule => ({ behavior: value, source, rule }))));
    return { state: { rules } };
  });
  const refresh = () => load(rulesBox, fetchRules, ({ state }) => {
    const rules = state?.rules || [];
    if (!rules.length) return empty('אין כללים. Claude ישאל לפי מצב ההרשאות.');
    return list(rules.map(rule => {
      const destination = DESTINATIONS.find(item => item.source === rule.source);
      return row({
        title: h('code', { dir: 'ltr' }, rule.rule), badges: [badge(rule.behavior, TONES[rule.behavior]), badge(rule.source)],
        sub: rule.description ? `${rule.description.prefix || ''}${rule.description.emphasis || ''}` : '',
        actions: destination ? [button('מחיקה', async () => {
          await editRule(context, destination.value, rule.behavior, rule.rule, true);
          context.toast('הכלל נמחק. ייכנס לתוקף בהודעה הבאה.');
          refresh();
        }, { variant: 'danger' })] : [badge('לקריאה בלבד')],
      });
    }));
  });

  body.append(section('כללי הרשאה', 'כללים מכל קובצי ההגדרות, כפי ש-Claude Code רואה אותם עכשיו.', rulesBox,
    h('div', { class: 'form-grid', style: 'margin-top:14px' }, field('כלל', ruleInput, { wide: true, hint: 'פורמט: Tool או Tool(specifier). כוכבית * לתבנית.' }),
      field('פעולה', behaviorSelect), field('איפה לשמור', destinationSelect)),
    button('הוספת כלל', async () => {
      if (!ruleInput.value.trim()) return;
      await editRule(context, destinationSelect.value, behaviorSelect.value, ruleInput.value.trim(), false);
      ruleInput.value = '';
      context.toast('הכלל נשמר. ייכנס לתוקף בהודעה הבאה.');
      refresh();
    }, { variant: 'primary', small: false })));
  refresh();
}
