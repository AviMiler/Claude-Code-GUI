/** /context and /usage (/cost): context window by category, and the session's cost. */
import { h } from '../dom.js';
import { section, load, kv, button, empty } from './kit.js';
import { renderContextUsage } from '../context/context-usage-view.js';
import { contextInfo } from '../context/context-info.js';
import { loadContext } from '../context/context-live.js';

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
  // Opened on purpose, so it may start the CLI (no ifRunning); without a reading it shows the estimate (context/).
  load(contextBox, () => loadContext(session), ({ note }) => { context.refreshView?.(); return renderContextUsage(contextInfo(context.liveSession() || session), { note }); });
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
