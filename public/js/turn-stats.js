/**
 * Numbers of one finished turn for its meta line: time, output speed (tokens per second), tokens in and out, rounds,
 * tool calls, and cost when the CLI reports one. With a local model the speed matters more than the cost.
 */
import { formatTokens } from './dom.js';

const seconds = ms => `${(ms / 1000).toFixed(1)} שנ׳`;

/** Where a turn begins: a user message, but not a correction sent into a running turn (it belongs to that turn). */
export const isTurnStart = item => item.kind === 'user' && !item.correction;

/**
 * Tool calls of the turn that ends at `resultIndex` (top level and inside subagents), from the last user message on.
 * @param {object[]} items session.items @param {number} resultIndex @returns {number}
 */
export function countToolCalls(items, resultIndex) {
  let count = 0;
  for (let index = resultIndex - 1; index >= 0 && !isTurnStart(items[index]); index -= 1) {
    if (items[index].kind === 'tool') count += 1;
  }
  return count;
}

/**
 * @param {{durationMs:number, durationApiMs?:number, turns:number, costUsd:number,
 *   usage:{input:number, output:number, cacheRead?:number, cacheWrite?:number}|null}} result a `result` item
 * @param {number|null} toolCalls null when unknown
 * @returns {{text:string, details:string}} text for the line, details for its tooltip
 * @example turnStats({ durationMs: 12300, durationApiMs: 9800, turns: 2, costUsd: 0, usage: { input: 1200, output: 340 } }, 3)
 *   // { text: '12.3 שנ׳ · 35 טוקנים/שנ׳ · 1.2k → 340 טוקנים · 2 סבבים · 3 כלים', details: '…' }
 */
export function turnStats(result, toolCalls) {
  const usage = result.usage;
  const apiMs = result.durationApiMs || 0;
  // Speed of writing: output tokens over the time the model worked (the whole turn when that time is unknown).
  const speedMs = apiMs || result.durationMs;
  const speed = usage?.output && speedMs > 0 ? Math.round(usage.output / (speedMs / 1000)) : null;
  const input = usage ? usage.input + (usage.cacheRead || 0) + (usage.cacheWrite || 0) : 0;
  const parts = [seconds(result.durationMs)];
  if (speed !== null) parts.push(`${speed} טוקנים/שנ׳`);
  if (usage) parts.push(`${formatTokens(input)} → ${formatTokens(usage.output)} טוקנים`);
  if (result.turns > 1) parts.push(`${result.turns} סבבים`);
  if (toolCalls) parts.push(toolCalls === 1 ? 'כלי אחד' : `${toolCalls} כלים`);
  if (result.costUsd > 0) parts.push(`$${result.costUsd.toFixed(4)}`);
  const details = [
    `זמן כולל: ${seconds(result.durationMs)}`,
    apiMs ? `זמן המודל: ${seconds(apiMs)} · כלים ושאר: ${seconds(Math.max(0, result.durationMs - apiMs))}` : null,
    usage ? `קלט: ${usage.input.toLocaleString('he-IL')}` : null,
    usage?.cacheRead ? `נקרא מהמטמון: ${usage.cacheRead.toLocaleString('he-IL')}` : null,
    usage?.cacheWrite ? `נכתב למטמון: ${usage.cacheWrite.toLocaleString('he-IL')}` : null,
    usage ? `פלט: ${usage.output.toLocaleString('he-IL')}` : null,
    speed !== null ? `מהירות: ${speed} טוקנים לשנייה${apiMs ? '' : ' (לפי הזמן הכולל)'}` : null,
    `סבבים: ${result.turns || 1}`,
    toolCalls !== null ? `קריאות כלים: ${toolCalls}` : null,
    result.costUsd > 0 ? `עלות: $${result.costUsd.toFixed(4)}` : null,
    result.fromFile ? 'מחושב מקובץ השיחה (הרצה מחוץ ל-GUI), ללא עלות' : null,
  ].filter(Boolean).join('\n');
  return { text: parts.join(' · '), details };
}
