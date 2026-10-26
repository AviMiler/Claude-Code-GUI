/** /skills: every skill and custom command the CLI loaded, plus creating and editing skill files. */
import { h, formatTokens } from '../dom.js';
import { buildCommands } from '../command-catalog.js';
import { section, list, row, badge, button, field, select, empty, loading } from './kit.js';
import { fileEditor, markdownFile } from './file-editor.js';

const SCOPES = [{ value: 'project', label: 'פרויקט (.claude/skills)' }, { value: 'user', label: 'משתמש (~/.claude/skills)' }];

async function editableKind(context, scope, name) {
  for (const type of ['skill', 'command']) {
    const file = await context.api.readClaudeFile(context.scope, `${type}-${scope}`, name).catch(() => null);
    if (file?.exists) return `${type}-${scope}`;
  }
  return null;
}

function createForm(context, onCreated) {
  const scope = select(SCOPES, 'project');
  const name = h('input', { placeholder: 'my-skill', dir: 'ltr' });
  const description = h('input', { placeholder: 'מתי Claude צריך להשתמש ב-Skill הזה', dir: 'auto' });
  const body = h('textarea', { placeholder: 'ההוראות ל-Claude (Markdown)…', dir: 'auto' });
  const create = async () => {
    const slug = name.value.trim();
    if (!/^[\w][\w.-]*$/.test(slug)) return context.toast('שם לא תקין: אותיות באנגלית, ספרות, - ו-_', 'error');
    await context.api.writeClaudeFile(context.scope, `skill-${scope.value}`, slug,
      markdownFile({ name: slug, description: description.value.trim() }, body.value || 'Describe the steps here.'));
    await context.api.control(context.scope, 'reload_skills').catch(() => null);
    context.toast(`ה-Skill ${slug} נוצר`);
    onCreated();
  };
  return section('Skill חדש', 'נשמר כ-SKILL.md. Claude טוען אותו לפי התיאור, או כשמקלידים /שם.',
    h('div', { class: 'form-grid' }, field('שם', name), field('איפה', scope), field('תיאור', description, { wide: true }), field('הוראות', body, { wide: true })),
    button('יצירה', () => create().catch(error => context.toast(error.message, 'error')), { variant: 'primary', small: false }));
}

export async function renderSkillsPanel(body, context) {
  const search = h('input', { type: 'search', placeholder: 'חיפוש Skills…' });
  const listBox = h('div', null, loading('קורא Skills מ-Claude Code…'));
  const editorBox = h('div');
  const refresh = async () => {
    await context.api.control(context.scope, 'reload_skills').catch(() => null);
    await context.getCatalog({ refresh: true });
    context.rerender();
  };
  body.append(h('div', { class: 'panel-toolbar' }, search,
    button('רענון (/reload-skills)', refresh, { iconName: 'refresh' }),
    button('Skill חדש', () => editorBox.replaceChildren(createForm(context, refresh)), { variant: 'primary', iconName: 'plus' })),
  editorBox, listBox);

  const catalog = await context.getCatalog();
  const dialogSkills = new Map((catalog?.skills || []).map(skill => [skill.name, skill]));
  const skills = buildCommands(catalog).filter(command => command.group === 'skill' || command.group === 'plugin');
  const draw = () => {
    const needle = search.value.trim().toLowerCase();
    const shown = skills.filter(skill => !needle || `${skill.name} ${skill.description}`.toLowerCase().includes(needle));
    listBox.replaceChildren(section(`${shown.length} Skills ופקודות`, 'מה-CLI עצמו: מובנים, מהפרויקט, מהמשתמש ומפלאגינים.', shown.length ? list(shown.map(skill => {
      const info = dialogSkills.get(skill.name);
      const source = info?.source || skill.source;
      const editable = source === 'project' || source === 'user';
      return row({
        title: h('code', { dir: 'ltr' }, `/${skill.name}`),
        badges: [badge(source, source === 'project' ? 'accent' : source === 'user' ? 'info' : ''),
          info?.tokens ? badge(`${formatTokens(info.tokens)} טוקנים`) : null, info?.state && info.state !== 'on' ? badge(info.state, 'warning') : null].filter(Boolean),
        sub: skill.description,
        actions: [button('שימוש', () => { context.close(); context.insert(`/${skill.name} `); }, { variant: 'primary' }),
          editable ? button('עריכה', async () => {
            const kind = await editableKind(context, source, skill.name);
            if (!kind) return context.toast('לא נמצא קובץ לעריכה (אולי Skill מתיקייה אחרת)', 'error');
            editorBox.replaceChildren(fileEditor(context, { title: `עריכת /${skill.name}`, kind, name: skill.name, allowDelete: true,
              onSaved: refresh, onClose: () => editorBox.replaceChildren() }));
            editorBox.scrollIntoView({ behavior: 'smooth' });
          }) : null].filter(Boolean),
      });
    })) : empty(catalog ? 'אין Skills תואמים' : 'לא ניתן לקרוא את הרשימה מ-Claude Code')));
  };
  search.addEventListener('input', draw);
  draw();
}
