/** /mcp: live status of MCP servers (enable, disable, reconnect), adding and removing servers via `claude mcp`. */
import { h } from '../dom.js';
import { section, list, row, badge, button, field, select, load, empty, cliOutput } from './kit.js';

const STATUS_TONES = { connected: 'success', failed: 'danger', pending: 'warning', 'needs-auth': 'warning', disabled: '' };
const STATUS_LABELS = { connected: 'מחובר', failed: 'נכשל', pending: 'מתחבר…', 'needs-auth': 'דורש התחברות', disabled: 'כבוי' };
const SCOPES = [{ value: 'local', label: 'מקומי (רק לך, בפרויקט הזה)' }, { value: 'project', label: 'פרויקט (.mcp.json משותף)' }, { value: 'user', label: 'משתמש (כל הפרויקטים)' }];
const TRANSPORTS = [{ value: 'stdio', label: 'stdio (פקודה מקומית)' }, { value: 'http', label: 'HTTP' }, { value: 'sse', label: 'SSE' }];
const lines = text => text.split('\n').map(line => line.trim()).filter(Boolean);

function describeConfig(config = {}) {
  if (config.url) return `${config.type || 'http'} · ${config.url}`;
  return [config.command, ...(config.args || [])].filter(Boolean).join(' ');
}

function addForm(context, onDone) {
  const name = h('input', { placeholder: 'my-server', dir: 'ltr' });
  const transport = select(TRANSPORTS, 'stdio');
  const target = h('input', { placeholder: 'npx  או  https://example.com/mcp', dir: 'ltr' });
  const args = h('textarea', { placeholder: 'ארגומנט בכל שורה, למשל:\n-y\n@modelcontextprotocol/server-filesystem\nC:\\data', dir: 'ltr' });
  const env = h('textarea', { placeholder: 'KEY=value בכל שורה', dir: 'ltr' });
  const headers = h('textarea', { placeholder: 'Authorization: Bearer … בכל שורה (HTTP/SSE)', dir: 'ltr' });
  const scope = select(SCOPES, 'local');
  const output = h('div');
  const add = async () => {
    if (!name.value.trim() || !target.value.trim()) return context.toast('צריך שם ופקודה או כתובת', 'error');
    const command = ['mcp', 'add', '--transport', transport.value, '--scope', scope.value,
      ...lines(env.value).flatMap(item => ['-e', item]), ...lines(headers.value).flatMap(item => ['-H', item]), name.value.trim()];
    if (transport.value === 'stdio') command.push('--', target.value.trim(), ...lines(args.value));
    else command.push(target.value.trim());
    const result = await context.api.cli(command, context.folder);
    output.replaceChildren(cliOutput(result));
    if (result.code === 0) { context.toast(`השרת ${name.value.trim()} נוסף`); onDone(); }
  };
  return section('הוספת שרת MCP', 'מריץ claude mcp add. שרתים חדשים נטענים בהודעה הבאה (או ב"חיבור מחדש").',
    h('div', { class: 'form-grid' }, field('שם', name), field('סוג חיבור', transport), field('היקף', scope),
      field('פקודה או כתובת', target, { wide: true }), field('ארגומנטים (stdio)', args), field('משתני סביבה', env), field('כותרות (HTTP)', headers)),
    button('הוספה', () => add().catch(error => context.toast(error.message, 'error')), { variant: 'primary', small: false }), output);
}

export function renderMcpPanel(body, context) {
  const formBox = h('div');
  const listBox = h('div');
  const rawBox = h('div');
  const control = (subtype, payload) => context.api.control(context.scope, subtype, payload);
  const refresh = () => load(listBox, () => control('mcp_status'), ({ mcpServers = [] }) => {
    if (!mcpServers.length) return empty('אין שרתי MCP מוגדרים לתיקייה הזו. הוסף אחד למטה.');
    return list(mcpServers.map(server => {
      const tools = server.tools || [];
      const disabled = server.status === 'disabled';
      const run = action => async () => { try { await action(); } catch (error) { context.toast(error.message, 'error'); } refresh(); };
      return row({
        title: h('span', null, server.name),
        badges: [badge(STATUS_LABELS[server.status] || server.status, STATUS_TONES[server.status] ?? 'info'), server.scope ? badge(server.scope) : null,
          tools.length ? badge(`${tools.length} כלים`, 'info') : null, server.serverInfo?.version ? badge(`v${server.serverInfo.version}`) : null].filter(Boolean),
        sub: [describeConfig(server.config), server.error].filter(Boolean).join('\n'), mono: true,
        actions: [
          context.session ? button(disabled ? 'הפעלה' : 'כיבוי', run(() => control('mcp_toggle', { serverName: server.name, enabled: disabled }))) : null,
          context.session && !disabled ? button('חיבור מחדש', run(() => control('mcp_reconnect', { serverName: server.name })), { iconName: 'refresh' }) : null,
          ['local', 'user', 'project'].includes(server.scope) ? button('הסרה', run(async () => {
            if (!await context.ask({ title: `להסיר את ${server.name}?`, confirmLabel: 'הסרה', danger: true })) return;
            const result = await context.api.cli(['mcp', 'remove', server.name, '--scope', server.scope], context.folder);
            context.toast(result.code === 0 ? 'השרת הוסר' : (result.stderr || result.stdout), result.code === 0 ? 'info' : 'error');
          }), { variant: 'danger' }) : null,
        ].filter(Boolean),
        details: tools.length ? h('details', null, h('summary', null, 'כלים'), h('pre', { class: 'output-pre' }, tools.map(tool => tool.name || tool).join('\n'))) : null,
      });
    }));
  });
  body.append(
    h('div', { class: 'panel-toolbar' }, button('רענון', refresh, { iconName: 'refresh' }),
      button('הוספת שרת', () => formBox.replaceChildren(addForm(context, refresh)), { variant: 'primary', iconName: 'plus' }),
      button('claude mcp list', () => load(rawBox, () => context.api.cli(['mcp', 'list'], context.folder), cliOutput), { iconName: 'terminal' })),
    formBox, section('שרתים', context.session ? null : 'אין סשן פתוח: מוצג המצב של התיקייה. הפעלה/כיבוי זמינים בתוך סשן.', listBox), rawBox);
  refresh();
}
