/** /plugin: installed and available plugins, marketplaces, via `claude plugin ... --json`. */
import { h } from '../dom.js';
import { section, list, row, badge, button, load, empty, tabs, cliOutput } from './kit.js';

const TABS = [{ id: 'installed', label: 'מותקנים' }, { id: 'available', label: 'זמינים להתקנה' }, { id: 'marketplaces', label: 'Marketplaces' }];
let currentTab = 'installed';

const pluginId = plugin => plugin.id || plugin.pluginId || (plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name);

export function renderPluginsPanel(body, context) {
  const content = h('div');
  const output = h('div');
  const cli = async (args, success) => {
    const result = await context.api.cli(args, context.folder);
    output.replaceChildren(cliOutput(result));
    if (result.code === 0) {
      context.toast(success);
      await context.api.control(context.scope, 'reload_plugins').catch(() => null);
      await context.getCatalog({ refresh: true });
      show(currentTab);
    }
  };
  const guard = action => () => action().catch(error => context.toast(error.message, 'error'));

  function installed() {
    load(content, () => context.api.cli(['plugin', 'list', '--json'], context.folder), result => {
      const plugins = Array.isArray(result.json) ? result.json : result.json?.installed || [];
      if (!plugins.length) return [empty('אין פלאגינים מותקנים. עבור ל"זמינים להתקנה".'), result.code ? cliOutput(result) : null];
      return list(plugins.map(plugin => row({
        title: h('code', { dir: 'ltr' }, pluginId(plugin)),
        badges: [badge(plugin.enabled === false ? 'כבוי' : 'פעיל', plugin.enabled === false ? '' : 'success'), plugin.version ? badge(`v${plugin.version}`) : null,
          plugin.scope ? badge(plugin.scope) : null, plugin.errors ? badge('שגיאות', 'danger') : null].filter(Boolean),
        sub: [plugin.description, ...(plugin.errors || [])].filter(Boolean).join('\n'),
        actions: [
          button(plugin.enabled === false ? 'הפעלה' : 'כיבוי', guard(() => cli(['plugin', plugin.enabled === false ? 'enable' : 'disable', pluginId(plugin)], 'עודכן'))),
          button('עדכון', guard(() => cli(['plugin', 'update', pluginId(plugin)], 'עודכן (ייתכן שנדרשת הפעלה מחדש)'))),
          button('פרטים', guard(async () => output.replaceChildren(cliOutput(await context.api.cli(['plugin', 'details', pluginId(plugin)], context.folder))))),
          button('הסרה', guard(async () => {
            if (await context.ask({ title: `להסיר את ${pluginId(plugin)}?`, confirmLabel: 'הסרה', danger: true })) await cli(['plugin', 'uninstall', pluginId(plugin)], 'הוסר');
          }), { variant: 'danger' }),
        ],
      })));
    });
  }

  function available() {
    load(content, () => context.api.cli(['plugin', 'list', '--available', '--json'], context.folder), result => {
      const plugins = result.json?.available || [];
      if (!plugins.length) return [empty('אין פלאגינים זמינים. הוסף marketplace בלשונית Marketplaces.'), result.code ? cliOutput(result) : null];
      return list(plugins.map(plugin => row({
        title: h('code', { dir: 'ltr' }, pluginId(plugin)),
        badges: [plugin.version ? badge(`v${plugin.version}`) : null, plugin.installed ? badge('מותקן', 'success') : null].filter(Boolean),
        sub: plugin.description || '',
        actions: [button('התקנה', guard(() => cli(['plugin', 'install', pluginId(plugin)], 'הותקן')), { variant: 'primary' })],
      })));
    });
  }

  function marketplaces() {
    const source = h('input', { placeholder: 'owner/repo  ·  https://…  ·  C:\\path\\to\\marketplace', dir: 'ltr' });
    const listBox = h('div');
    content.replaceChildren(section('הוספת marketplace', null, h('div', { class: 'panel-toolbar' }, source,
      button('הוספה', guard(() => cli(['plugin', 'marketplace', 'add', source.value.trim()], 'נוסף')), { variant: 'primary' }),
      button('עדכון כולם', guard(() => cli(['plugin', 'marketplace', 'update'], 'עודכן'))))), listBox);
    load(listBox, () => context.api.cli(['plugin', 'marketplace', 'list', '--json'], context.folder), result => {
      const items = Array.isArray(result.json) ? result.json : [];
      if (!items.length) return [empty('אין marketplaces מוגדרים'), result.code ? cliOutput(result) : null];
      return list(items.map(item => row({
        title: item.name, sub: typeof item.source === 'string' ? item.source : JSON.stringify(item.source || item.url || ''), mono: true,
        actions: [button('עדכון', guard(() => cli(['plugin', 'marketplace', 'update', item.name], 'עודכן'))),
          button('הסרה', guard(() => cli(['plugin', 'marketplace', 'remove', item.name], 'הוסר')), { variant: 'danger' })],
      })));
    });
  }

  const strip = h('div');
  function show(tab) {
    currentTab = tab;
    strip.replaceChildren(tabs(TABS, tab, show));
    ({ installed, available, marketplaces })[tab]();
  }
  body.append(strip, content, section('פלט', null, output));
  show(currentTab);
}
