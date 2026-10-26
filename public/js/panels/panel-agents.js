/** /agents: subagents the CLI knows (built-in, project, user, plugin) and editing agent files. */
import { h } from '../dom.js';
import { section, list, row, badge, button, field, select, empty, loading } from './kit.js';
import { fileEditor, markdownFile } from './file-editor.js';

const SCOPES = [{ value: 'project', label: 'פרויקט (.claude/agents)' }, { value: 'user', label: 'משתמש (~/.claude/agents)' }];
const MODELS = [{ value: '', label: 'ירושה מהסשן' }, { value: 'inherit', label: 'inherit' }, { value: 'opus', label: 'opus' },
  { value: 'sonnet', label: 'sonnet' }, { value: 'haiku', label: 'haiku' }];

function createForm(context, onCreated) {
  const scope = select(SCOPES, 'project');
  const name = h('input', { placeholder: 'code-reviewer', dir: 'ltr' });
  const description = h('input', { placeholder: 'מתי להשתמש בסוכן (Claude מחליט לפי זה)', dir: 'auto' });
  const tools = h('input', { placeholder: 'Read, Grep, Glob, Bash (ריק = כל הכלים)', dir: 'ltr' });
  const model = select(MODELS, '');
  const prompt = h('textarea', { placeholder: 'הנחיית המערכת של הסוכן…', dir: 'auto' });
  const create = async () => {
    const slug = name.value.trim();
    if (!/^[\w][\w.-]*$/.test(slug)) return context.toast('שם לא תקין: אותיות באנגלית, ספרות, - ו-_', 'error');
    await context.api.writeClaudeFile(context.scope, `agent-${scope.value}`, slug, markdownFile(
      { name: slug, description: description.value.trim(), tools: tools.value.trim(), model: model.value }, prompt.value || `You are ${slug}.`));
    context.toast(`הסוכן ${slug} נוצר. הוא יופיע בהודעה הבאה.`);
    onCreated();
  };
  return section('סוכן חדש', 'קובץ Markdown עם front matter. Claude יכול להפעיל אותו דרך הכלי Agent, או שתזמין אותו עם @agent-שם.',
    h('div', { class: 'form-grid' }, field('שם', name), field('איפה', scope), field('תיאור', description, { wide: true }),
      field('כלים', tools), field('מודל', model), field('הנחיית מערכת', prompt, { wide: true })),
    button('יצירה', () => create().catch(error => context.toast(error.message, 'error')), { variant: 'primary', small: false }));
}

export async function renderAgentsPanel(body, context) {
  const editorBox = h('div');
  const listBox = h('div', null, loading('קורא סוכנים…'));
  const refresh = async () => { await context.getCatalog({ refresh: true }); context.rerender(); };
  body.append(h('div', { class: 'panel-toolbar' },
    button('רענון', refresh, { iconName: 'refresh' }),
    button('סוכן חדש', () => editorBox.replaceChildren(createForm(context, refresh)), { variant: 'primary', iconName: 'plus' })),
  editorBox, listBox);

  const [catalog, files] = await Promise.all([context.getCatalog(), context.api.claudeFiles(context.scope).catch(() => ({ agents: [] }))]);
  const fileByName = new Map(files.agents.map(agent => [agent.meta.name || agent.name, agent]));
  const agents = catalog?.agents?.length ? catalog.agents : files.agents.map(agent => ({ name: agent.meta.name || agent.name, description: agent.meta.description, model: agent.meta.model }));
  const sessionAgent = context.session?.agent || '';
  listBox.replaceChildren(section(`${agents.length} סוכנים`, 'כפי ש-Claude Code טוען אותם עכשיו.', agents.length ? list(agents.map(agent => {
    const file = fileByName.get(agent.name);
    return row({
      title: h('code', { dir: 'ltr' }, agent.name),
      badges: [file ? badge(file.scope, file.scope === 'project' ? 'accent' : 'info') : badge('מובנה'), agent.model ? badge(agent.model) : null,
        sessionAgent === agent.name ? badge('הסוכן הראשי של הסשן', 'success') : null].filter(Boolean),
      sub: agent.description,
      actions: [
        button('@הזמנה', () => { context.close(); context.insert(`@agent-${agent.name} `); }, { variant: 'primary' }),
        context.session ? button(sessionAgent === agent.name ? 'ביטול כראשי' : 'כסוכן ראשי',
          async () => { await context.updateSession({ agent: sessionAgent === agent.name ? '' : agent.name }); context.rerender(); }) : null,
        file ? button('עריכה', () => {
          editorBox.replaceChildren(fileEditor(context, { title: `עריכת ${agent.name}`, kind: file.kind, name: file.name, allowDelete: true,
            onSaved: refresh, onClose: () => editorBox.replaceChildren() }));
          editorBox.scrollIntoView({ behavior: 'smooth' });
        }) : null,
      ].filter(Boolean),
    });
  })) : empty('לא נמצאו סוכנים')));
}
