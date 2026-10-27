/** /model, /effort, /output-style, /add-dir: model, effort, output style, main agent and extra folders of the session. */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { EFFORT_LEVELS } from '../modes.js';
import { section, field, select, button, list, row, empty, loading } from './kit.js';
import { pickFolder } from '../folder-browser.js';

function modelCards(models, currentModel, onPick) {
  return h('div', { class: 'radio-cards' }, models.map(model => h('button', {
    type: 'button', class: `radio-card${model.value === currentModel ? ' on' : ''}`, onClick: () => onPick(model.value),
  }, icon(model.value === currentModel ? 'check-circle' : 'circle'), h('b', null, model.displayName || model.value),
  h('code', { dir: 'ltr' }, model.value), h('span', { dir: 'auto' }, model.description || ''))));
}

export async function renderModelPanel(body, context) {
  const { session, config } = context;
  const settings = session || context.draft;
  body.append(loading('קורא את רשימת המודלים מ-Claude Code…'));
  const catalog = await context.getCatalog();
  body.replaceChildren();
  const currentModel = settings.model || config.model || 'default';
  const apply = async patch => { await context.updateSession(patch); context.rerender(); };

  const models = catalog?.models?.length ? catalog.models : [{ value: 'default', displayName: 'ברירת מחדל', description: 'המודל שמוגדר ב-Claude Code' }];
  const custom = h('input', { placeholder: 'שם מודל מלא, למשל qwen3.8:27b או claude-sonnet-5-5', dir: 'ltr', value: models.some(m => m.value === currentModel) ? '' : currentModel });
  body.append(section('מודל', session ? 'המודל מתחלף מיד גם בסשן שרץ (set_model).' : 'יחול על הסשן החדש הבא.',
    modelCards(models, currentModel, value => apply({ model: value === 'default' ? '' : value })),
    h('div', { class: 'panel-toolbar', style: 'margin-top:10px' }, custom,
      button('שימוש במודל מותאם', () => custom.value.trim() && apply({ model: custom.value.trim() }), { variant: 'primary' }))));

  const modelInfo = models.find(model => model.value === currentModel);
  const levels = EFFORT_LEVELS.filter(level => !level.value || !modelInfo?.supportedEffortLevels || modelInfo.supportedEffortLevels.includes(level.value));
  body.append(section('מאמץ (effort)', 'כמה המודל חושב לפני שהוא עונה. גבוה = איטי ויסודי יותר.',
    h('div', { class: 'segmented', style: 'margin:0;max-width:560px' }, levels.map(level => h('button', {
      type: 'button', class: (settings.effort || '') === level.value ? 'on' : '', onClick: () => apply({ effort: level.value }),
    }, level.label)))));

  if (!session) {
    body.append(empty('סגנון תשובה, סוכן ראשי ותיקיות נוספות מוגדרים לכל סשן. פתח או צור סשן כדי לשנות אותם.'));
    return;
  }
  const styles = (catalog?.outputStyles?.length ? catalog.outputStyles : ['default']).map(style => ({ value: style === 'default' ? '' : style, label: style }));
  const styleSelect = select(styles, session.outputStyle || '');
  styleSelect.addEventListener('change', () => apply({ outputStyle: styleSelect.value }));
  const agents = [{ value: '', label: '(ללא – Claude הרגיל)' }, ...(catalog?.agents || []).map(agent => ({ value: agent.name, label: agent.name }))];
  const agentSelect = select(agents, session.agent || '');
  agentSelect.addEventListener('change', () => apply({ agent: agentSelect.value }));
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
