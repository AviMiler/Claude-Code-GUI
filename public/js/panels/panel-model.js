/** /model, /effort, /output-style, /add-dir: model, effort, fallback model, output style, main agent and extra folders of the session. */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { EFFORT_LEVELS } from '../modes.js';
import { section, field, select, button, list, row, empty, loading, errorBox } from './kit.js';
import { pickFolder } from '../folder-browser.js';
import { getModels } from '../state.js';
import { fallbackSection } from './panel-fallback.js';

function modelCards(models, currentModel, onPick) {
  return h('div', { class: 'radio-cards' }, models.map(model => h('button', {
    type: 'button', class: `radio-card${model.value === currentModel ? ' on' : ''}`, onClick: () => onPick(model.value),
  }, icon(model.value === currentModel ? 'check-circle' : 'circle'), h('b', null, model.displayName || model.value),
  model.displayName && model.displayName !== model.value ? h('code', { dir: 'ltr' }, model.value) : h('span'),
  h('span', { dir: 'auto' }, model.description || ''))));
}

export async function renderModelPanel(body, context) {
  const { session, config } = context;
  const settings = session || context.draft;
  body.append(loading('קורא את רשימת המודלים מ-Claude Code…'));
  const [catalog, system] = await Promise.all([context.getCatalog(), getModels(context.scope)]);
  body.replaceChildren();
  const currentModel = settings.model || config.model || system.current || 'default';
  const apply = async patch => { await context.updateSession(patch); context.rerender(); };

  // The list is what the system really has (the model server, or the CLI's list on Anthropic); one model = nothing to pick.
  const models = system.models.length ? system.models : [{ value: currentModel, displayName: currentModel === 'default' ? 'ברירת מחדל' : currentModel }];
  const custom = h('input', { placeholder: 'שם מודל מלא, למשל qwen3.8:27b או claude-sonnet-5-5', dir: 'ltr', value: models.some(m => m.value === currentModel) ? '' : currentModel });
  const other = h('details', { class: 'advanced' }, h('summary', null, 'מודל אחר שלא ברשימה (מתקדם)'),
    h('div', { class: 'panel-toolbar', style: 'margin-top:8px' }, custom,
      button('שימוש במודל הזה', () => custom.value.trim() && apply({ model: custom.value.trim() }), { variant: 'primary' })));
  body.append(system.switchable
    ? section('מודל', session ? 'המודלים שזמינים במערכת. ההחלפה חלה מיד גם בסשן שרץ (set_model).' : 'המודלים שזמינים במערכת. יחול על הסשן החדש הבא.',
      modelCards(models, currentModel, value => apply({ model: value === 'default' ? '' : value })), system.error ? errorBox(system.error) : null, other)
    : section('מודל', 'במערכת מוגדר מודל אחד, אז אין מה להחליף.',
      h('div', { class: 'kv' }, h('div', null, 'המודל'), h('div', { dir: 'ltr' }, models[0].displayName || models[0].value)),
      system.error ? errorBox(system.error) : null, other));

  const modelInfo = models.find(model => model.value === currentModel);
  const levels = EFFORT_LEVELS.filter(level => !level.value || !modelInfo?.supportedEffortLevels || modelInfo.supportedEffortLevels.includes(level.value));
  body.append(section('מאמץ (effort)', 'כמה המודל חושב לפני שהוא עונה. גבוה = איטי ויסודי יותר.',
    h('div', { class: 'segmented', style: 'margin:0;max-width:560px' }, levels.map(level => h('button', {
      type: 'button', class: (settings.effort || '') === level.value ? 'on' : '', onClick: () => apply({ effort: level.value }),
    }, level.label)))));

  if (!session) {
    body.append(empty('מודל גיבוי, סגנון תשובה, סוכן ראשי ותיקיות נוספות מוגדרים לכל סשן. פתח או צור סשן כדי לשנות אותם.'));
    return;
  }
  const styles = (catalog?.outputStyles?.length ? catalog.outputStyles : ['default']).map(style => ({ value: style === 'default' ? '' : style, label: style }));
  const styleSelect = select(styles, session.outputStyle || '');
  styleSelect.addEventListener('change', () => apply({ outputStyle: styleSelect.value }));
  const agents = [{ value: '', label: '(ללא – Claude הרגיל)' }, ...(catalog?.agents || []).map(agent => ({ value: agent.name, label: agent.name }))];
  const agentSelect = select(agents, session.agent || '');
  agentSelect.addEventListener('change', () => apply({ agent: agentSelect.value }));
  body.append(fallbackSection({ session, models, current: currentModel, supported: Boolean(context.capabilities?.flags?.includes('--fallback-model')), apply, toast: context.toast }));
  body.append(section('סגנון ותפקיד', 'נכנסים לתוקף בהודעה הבאה (Claude Code מופעל מחדש עם השיחה הקיימת).',
    h('div', { class: 'form-grid' }, field('סגנון תשובה (/output-style)', styleSelect), field('סוכן ראשי לסשן (--agent)', agentSelect))));

  const dirInput = h('input', { placeholder: 'C:\\path\\to\\folder', dir: 'ltr' });
  const dirs = session.addDirs || [];
  body.append(section('תיקיות עבודה נוספות (/add-dir)', 'Claude יוכל לקרוא ולערוך גם בתיקיות האלה.',
    dirs.length ? list(dirs.map(dir => row({ title: h('code', { dir: 'ltr' }, dir), actions: [
      button('הסרה', () => apply({ addDirs: dirs.filter(item => item !== dir) }), { variant: 'danger' })] }))) : empty('אין תיקיות נוספות'),
    h('div', { class: 'panel-toolbar', style: 'margin-top:10px' }, dirInput,
      button('עיון…', async () => { const dir = await pickFolder(dirInput.value.trim() || context.folder); if (dir) dirInput.value = dir; }, { iconName: 'folder' }),
      button('הוספה', () => dirInput.value.trim() && apply({ addDirs: [...dirs, dirInput.value.trim()] }).catch(error => context.toast(error.message, 'error')), { variant: 'primary' }))));
}
