/**
 * The context report of the usage panel and the session details rail: the total against the model's REAL window, a
 * stacked bar and a legend. The CLI's categories are measured against its own window (200K); here they are
 * scaled to the real one: free space = window − used (never negative), and "מעבר לחלון" when used > window.
 * Colours are classes (context.css, both themes); only widths are set inline, as a CSS variable.
 */
import { h, formatTokens } from '../dom.js';
import { contextLevel, sourceLabel, percentText } from './context-info.js';

const SEGMENT_COLORS = 8; // .seg-0 … .seg-7 in context.css

/** The CLI's categories that take room in the context (not free space, not the reserve, not tools loaded on demand). */
function usedCategories(usage) {
  return (usage?.categories || []).filter(category => category.kind === 'used'
    || (!category.kind && !category.isDeferred && !/free|buffer/i.test(category.name)));
}

/**
 * @param {ReturnType<import('./context-info.js').contextInfo>} info null: nothing known yet
 * @param {{note?:string|null}} [options] note: why the CLI gave no breakdown (muted line)
 * @returns {Node[]}
 */
export function renderContextUsage(info, { note = null } = {}) {
  if (!info) {
    return [h('p', { class: 'context-empty' }, 'עוד אין נתונים על ההקשר: הם יופיעו אחרי התור הראשון.'), note ? h('p', { class: 'context-note' }, note) : null].filter(Boolean);
  }
  const over = info.tokens > info.window;
  const scale = Math.max(info.window, info.tokens, 1); // past the window the bar shows everything, with a mark where the window ends
  const share = tokens => `${((tokens / scale) * 100).toFixed(2)}%`;
  const ofWindow = tokens => `${((tokens / info.window) * 100).toFixed(1)}%`;
  let used = usedCategories(info.usage).map((category, index) => ({ name: category.name, tokens: category.tokens || 0, tone: `seg-${index % SEGMENT_COLORS}` }));
  if (!used.length) used = [{ name: info.tokenSource === 'live' ? 'בשימוש' : 'שיחה (הערכה)', tokens: info.tokens, tone: 'seg-0' }];
  // The CLI's autocompact reserve is part of ITS window; against another model's window it means nothing.
  const reserve = info.source === 'cli' ? (info.usage?.categories || []).filter(category => category.kind === 'buffer') : [];
  const deferred = (info.usage?.categories || []).filter(category => category.kind === 'deferred' || category.isDeferred);
  const reserved = reserve.reduce((sum, category) => sum + (category.tokens || 0), 0);
  const free = Math.max(0, info.window - info.tokens - reserved);

  const segment = (item, tone) => h('span', { class: `context-seg ${tone}`, style: `--w:${share(item.tokens)}`, title: `${item.name}: ${formatTokens(item.tokens)}` });
  const bar = h('div', { class: `context-bar${over ? ' is-over' : ''}`, role: 'img', 'aria-label': `${info.percent}% מהחלון בשימוש` },
    used.map(item => segment(item, item.tone)), reserve.map(item => segment(item, 'seg-reserve')),
    over ? h('i', { class: 'context-window-mark', style: `--at:${share(info.window)}`, title: `סוף החלון: ${formatTokens(info.window)}` }) : null);
  const legendRow = (name, tokens, tone, percent = ofWindow(tokens)) => h('div', { class: 'legend-row' },
    h('i', { class: `context-swatch ${tone}` }), h('span', { dir: 'auto' }, name), h('span', { class: 'num' }, formatTokens(tokens)), h('span', { class: 'num' }, percent));

  return [
    h('p', { class: `context-total level-${contextLevel(info)}` }, h('span', { class: 'context-percent', dir: 'ltr' }, percentText(info)),
      h('span', { class: 'context-of' }, `${formatTokens(info.tokens)} מתוך ${formatTokens(info.window)} טוקנים`),
      info.isEstimate ? h('span', { class: 'badge warning', title: 'לא מדידה מדויקת' }, 'הערכה') : null),
    over ? h('p', { class: 'context-over-note' }, `מעבר לחלון ב-${formatTokens(info.tokens - info.window)} טוקנים: המודל כנראה כבר לא רואה את תחילת השיחה. כדאי לדחוס (/compact) או לנקות.`) : null,
    bar,
    h('div', { class: 'legend' }, used.map(item => legendRow(item.name, item.tokens, item.tone)),
      reserve.map(item => legendRow(item.name, item.tokens, 'seg-reserve')),
      over ? legendRow('מעבר לחלון', info.tokens - info.window, 'seg-over') : legendRow('מקום פנוי', free, 'seg-free'),
      deferred.map(item => legendRow(`${item.name} (נטען לפי צורך)`, item.tokens || 0, 'seg-deferred', '—'))),
    h('p', { class: 'context-note' }, `חלון: ${sourceLabel(info.source)}. ${info.tokenSource === 'live' ? 'הטוקנים: מדידה של Claude Code.' : 'הטוקנים: הערכה לפי סוף התור האחרון.'}`),
    note && info.tokenSource !== 'live' ? h('p', { class: 'context-note' }, note) : null,
  ].filter(Boolean);
}
