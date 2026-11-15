/**
 * The ONE place that says how full a session's context is, so the composer ring, the rail card and the usage panel
 * agree. Tokens: the CLI's live reading when there is one, otherwise an estimate from the session's items (survives a
 * reload and a stopped process). Window: the model's real window from the server (context-window.js), otherwise the
 * CLI's own maxTokens, otherwise the CLI's default 200K (both wrong for a local model, so marked as such).
 */
import { state } from '../state.js';
import { formatTokens } from '../dom.js';
import { peekWindow } from './context-window.js';

const CLI_DEFAULT_WINDOW = 200000;
const DEFAULT_WARN_PERCENT = 70;

const SOURCE_LABELS = {
  config: 'נקבע ב-config.json (contextWindow)',
  num_ctx: 'num_ctx של המודל בשרת Ollama',
  loaded: 'החלון שהמודל טעון איתו עכשיו בשרת Ollama',
  model: 'המקסימום שהמודל תומך בו. זו הערכה: השרת מריץ לרוב חלון קטן יותר (אפשר לקבוע contextWindow ב-config.json)',
  cli: 'החלון ש-Claude Code מניח (לא בהכרח החלון של המודל המקומי)',
  'cli-default': 'ברירת המחדל של Claude Code (200K): החלון האמיתי של המודל לא ידוע',
};

const isClear = item => item.kind === 'divider' && (item.cleared || item.text?.startsWith('שיחה חדשה'));
const isCompact = item => item.kind === 'divider' && /נדחסה|compact/.test(item.text || '');

/**
 * Tokens in the context after the last finished turn: the input side of its `result` (input + cache read + cache write,
 * as turn-stats.js sums it). The CLI adds that up over all model calls of the turn, so a turn of several rounds is
 * divided by its rounds. A /clear or a compaction after the last result: unknown (null), the old number is gone.
 * @param {object[]} items session.items @returns {number|null}
 * @example estimateTokens([{ kind: 'result', turns: 1, usage: { input: 9000, output: 300, cacheRead: 3000 } }]) // 12000
 */
export function estimateTokens(items) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (isClear(item) || isCompact(item)) return null;
    if (item.kind !== 'result' || item.parent || !item.usage) continue;
    const input = (item.usage.input || 0) + (item.usage.cacheRead || 0) + (item.usage.cacheWrite || 0);
    if (input > 0) return Math.round(input / Math.max(1, item.turns || 1));
  }
  return null;
}

/**
 * @param {object|null} session @param {()=>void} [onChange] redraw once the real window arrives from the server
 * @returns {{tokens:number, window:number, percent:number, source:string, tokenSource:'live'|'items', isEstimate:boolean,
 *   windowKnown:boolean, warnPercent:number, usage:object|null}|null} null: nothing known (the ring hides)
 *   percent may exceed 100; windowKnown: the server answered (false while it is still being asked)
 */
export function contextInfo(session, onChange) {
  if (!session) return null;
  const server = peekWindow(session, onChange);
  const usage = state.context.get(session.id) || null;
  const tokens = usage ? usage.totalTokens : estimateTokens(session.items || []);
  if (tokens === null || tokens === undefined) return null;
  let window = server?.window || null;
  let source = server?.source || null;
  let windowEstimate = Boolean(server?.estimate);
  if (!window && usage?.maxTokens > 0) { window = usage.maxTokens; source = 'cli'; }
  if (!window) { window = CLI_DEFAULT_WINDOW; source = 'cli-default'; windowEstimate = true; }
  return {
    tokens, window, percent: Math.round((tokens / window) * 100), source, tokenSource: usage ? 'live' : 'items',
    isEstimate: !usage || windowEstimate, windowKnown: server !== undefined, warnPercent: server?.warnPercent || DEFAULT_WARN_PERCENT, usage,
  };
}

/** 'ok' | 'warn' | 'over': the colour of the ring and the rail value. */
export const contextLevel = info => (info.percent > 100 ? 'over' : info.percent >= info.warnPercent ? 'warn' : 'ok');

export const sourceLabel = source => SOURCE_LABELS[source] || '';

/** The percentage as shown: "≈43%" for an estimate. */
export const percentText = info => `${info.isEstimate ? '≈' : ''}${info.percent}%`;

/** Tooltip text: the numbers, where each comes from, and what "over the window" means. */
export function describeContext(info) {
  return [
    `ניצול הקשר: ${info.percent}%${info.isEstimate ? ' (הערכה)' : ''}`,
    `${formatTokens(info.tokens)} מתוך ${formatTokens(info.window)} טוקנים`,
    info.tokenSource === 'live' ? 'טוקנים: מדידה של Claude Code' : 'טוקנים: הערכה לפי סוף התור האחרון',
    `חלון: ${sourceLabel(info.source)}`,
    info.percent > 100 ? 'מעבר לחלון: המודל כנראה כבר לא רואה את תחילת השיחה.' : null,
  ].filter(Boolean).join('\n');
}
