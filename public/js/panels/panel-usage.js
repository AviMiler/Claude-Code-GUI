/** /context and /usage (/cost): context window by category, and the session's cost. */
import { h, formatTokens } from '../dom.js';
import { section, load, kv, button, empty } from './kit.js';

const PALETTE = ['#D97757', '#6A9BCC', '#788C5D', '#C2A05A', '#9B7EBD', '#5FA8A0', '#CC6F8E', '#8A8577'];

/** Context window by category: total, a stacked bar and a legend (also used by the session details rail). */
export function renderContextUsage(usage) {
  const used = (usage.categories || []).filter(category => category.kind === 'used' || (!category.kind && !/free/i.test(category.name)));
  const buffer = (usage.categories || []).filter(category => category.kind === 'buffer');
  const deferred = (usage.categories || []).filter(category => category.kind === 'deferred' || category.isDeferred);
  const max = usage.maxTokens || usage.rawMaxTokens || 1;
  const colored = used.map((category, index) => ({ ...category, color: PALETTE[index % PALETTE.length] }));
  const bar = h('div', { class: 'context-bar', role: 'img', 'aria-label': `${usage.percentage ?? 0}% בשימוש` },
    colored.map(category => h('span', { style: `width:${(category.tokens / max) * 100}%;background:${category.color}`, title: `${category.name}: ${formatTokens(category.tokens)}` })),
    buffer.map(category => h('span', { style: `width:${(category.tokens / max) * 100}%;background:repeating-linear-gradient(45deg,var(--border-strong) 0 3px,transparent 3px 6px)`, title: category.name })));
  const legendRow = (category, color) => h('div', { class: 'legend-row' }, h('i', { style: `background:${color}` }), h('span', null, category.name),
    h('span', { class: 'num' }, formatTokens(category.tokens)), h('span', { class: 'num' }, `${((category.tokens / max) * 100).toFixed(1)}%`));
  return [
    h('p', { style: 'margin:0 0 8px;font-size:22px;font-family:var(--font-serif)' }, `${usage.percentage ?? Math.round(((usage.totalTokens || 0) / max) * 100)}% `,
      h('span', { style: 'font-size:14px;color:var(--muted);font-family:var(--font-ui)' }, `${formatTokens(usage.totalTokens || 0)} מתוך ${formatTokens(max)} טוקנים`)),
    bar,
    h('div', { class: 'legend' }, colored.map(category => legendRow(category, category.color)),
      buffer.map(category => legendRow(category, 'var(--border-strong)')),
      deferred.map(category => legendRow({ ...category, name: `${category.name} (נטען לפי צורך)` }, 'transparent'))),
  ];
}

export function renderUsagePanel(body, context) {
  const contextBox = h('div');
  const costBox = h('div');
  const { session } = context;
  if (!session) {
    body.append(empty('ניצול הקשר ועלות שייכים לסשן. פתח סשן כדי לראות אותם.'));
    return;
  }
  body.append(
    section('חלון ההקשר (/context)', 'מה תופס מקום בהקשר של המודל עכשיו.', contextBox,
      h('div', { class: 'panel-toolbar', style: 'margin-top:12px' },
        button('דחיסת השיחה (/compact)', () => { context.close(); context.send('/compact'); }, { iconName: 'compress' }),
        button('ניקוי ההקשר (/clear)', () => { context.close(); context.runCommand('clear'); }, { iconName: 'refresh' }))),
    section('עלות ושימוש (/usage)', null, costBox));
  load(contextBox, () => context.api.control(context.scope, 'get_context_usage'), renderContextUsage);
  // The cost is the CLI's own figure (the user's decision): its running total for the current process, which starts
  // again with each new process (idle restart, settings change, resume). A CLI without get_usage shows only /cost's text.
  const ask = subtype => context.api.control(context.scope, subtype).catch(() => null);
  load(costBox, () => Promise.all([ask('get_usage'), ask('get_session_cost')]), ([usage, cost]) => {
    const cli = usage?.session && typeof usage.session.total_cost_usd === 'number' ? usage.session : null;
    return [
      kv([
        ...(cli ? [['עלות לפי ה-CLI (התהליך הנוכחי)', `$${cli.total_cost_usd.toFixed(4)}`],
          ['זמן API (התהליך הנוכחי)', `${((cli.total_api_duration_ms || 0) / 1000).toFixed(1)} שנ׳`],
          ['שורות שנוספו / נמחקו', `${cli.total_lines_added || 0} / ${cli.total_lines_removed || 0}`]] : []),
        ['הודעות בשיחה', String(session.items.filter(item => item.kind === 'user').length)],
        ['מזהה שיחה ב-CLI', session.claudeSessionId || '—']]),
      cli ? h('p', { class: 'muted', style: 'margin:6px 0 0;font-size:12px' }, 'ה-CLI סופר לכל תהליך בנפרד: המספר מתחיל מחדש כשהתהליך מופעל מחדש.') : null,
      cost?.text ? h('pre', { class: 'output-pre', style: 'margin-top:10px' }, cost.text) : null,
    ];
  });
}
