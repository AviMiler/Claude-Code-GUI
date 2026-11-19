/**
 * Result items for turns another program (a terminal: `claude --resume`) ran in a session's conversation. The CLI writes
 * no result line to its file, so the stats line and the changed-files card of such a turn come from the file's own lines:
 * the time from the typed message to the last message, the tokens of each answer, no cost (the file has none) and no
 * model time. Subagents' tokens are in their own files and are not counted.
 */
const { ENTRYPOINT } = require('../session-env');

const isMessage = line => line.type === 'user' || line.type === 'assistant';
const onlyToolResults = content => Array.isArray(content) && content.length > 0 && content.every(block => block.type === 'tool_result');
/** A prompt the CLI received (typed, or a command), not a tool's answer. */
const isTurnStart = line => line.type === 'user' && !line.isMeta && !onlyToolResults(line.message?.content);

/** @param {object[]} turn the turn's lines, its typed message first @returns {object|null} null when nothing answered */
function turnResult(turn) {
  const answers = new Map(); // message id -> its last line (the CLI writes one line per content block of an answer)
  for (const line of turn) if (line.type === 'assistant') answers.set(line.message?.id ?? line.uuid, line);
  if (!answers.size) return null;
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const { message } of answers.values()) {
    const used = message?.usage || {};
    usage.input += used.input_tokens || 0;
    usage.output += used.output_tokens || 0;
    usage.cacheRead += used.cache_read_input_tokens || 0;
    usage.cacheWrite += used.cache_creation_input_tokens || 0;
  }
  const last = turn.filter(isMessage).at(-1);
  const durationMs = Math.max(0, Date.parse(last.timestamp) - Date.parse(turn[0].timestamp)) || 0;
  return { kind: 'result', fromFile: true, isError: false, subtype: 'success', text: '', durationMs, durationApiMs: 0, costUsd: null, turns: answers.size, usage };
}

/**
 * @param {object[]} chain a conversation's lines as shown (transcript-items.js chainOf), oldest first
 * @returns {Map<string, {item:object, uuids:string[]}>} the uuid of a turn's last line -> the result item to show after
 *   it and the uuids of the turn's lines. Only turns another program ran (the GUI's own have their result in
 *   session.extras), and the last one only once it ended (`end_turn`).
 * @example fileResults(chainOf(lines)).get(lastLine.uuid).item // { kind: 'result', fromFile: true, durationMs: 8200, … }
 */
function fileResults(chain) {
  const results = new Map();
  const starts = chain.flatMap((line, index) => (isTurnStart(line) ? [index] : []));
  starts.forEach((start, position) => {
    if (chain[start].entrypoint === ENTRYPOINT) return;
    const end = starts[position + 1] ?? chain.length;
    const turn = chain.slice(start, end);
    const last = turn.filter(isMessage).at(-1);
    const ended = end < chain.length || (last.type === 'assistant' && last.message?.stop_reason === 'end_turn');
    const result = ended && turnResult(turn);
    if (result) results.set(turn.at(-1).uuid, { item: result, uuids: turn.map(line => line.uuid) });
  });
  return results;
}

module.exports = { fileResults };
