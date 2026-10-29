/**
 * What a session shows: its CLI conversations (lib/transcripts.js) with the GUI's own items between their lines.
 * GUI items (`session.extras`: turn results, notices, errors, dividers, `!` output) carry `anchors`, the uuids of the
 * CLI lines they came after, newest first; one is shown after the first of them still in the conversation, and left out
 * when none is (a rewind or a compaction left that part behind). An item with no anchor came before the current
 * conversation had a line. A message the GUI sent (`session.sent`, by uuid) is shown as it was typed, with its
 * attachments, as long as the CLI holds it as sent; otherwise the CLI's text is shown.
 */
const { chainOf, lineItems, rawText, subagentItems } = require('./transcripts');

/** How the GUI showed a message it sent, or null when the CLI holds something else (two messages joined, for example). */
function displayOf(sent) {
  const corrections = Object.values(sent).filter(meta => meta.correction);
  const sentText = meta => meta.sentText ?? meta.text;
  return line => {
    const raw = rawText(line);
    const meta = line.type === 'attachment' ? corrections.find(entry => sentText(entry) === raw) : sent[line.uuid];
    if (!meta || sentText(meta) !== raw) return null;
    return { text: meta.text, ...(meta.images && { images: meta.images }), ...(meta.files && { files: meta.files }) };
  };
}

/** Items with, after each tool call that started a subagent, that subagent's items (and so on, for nested ones). */
function withSubagents(items, agents, done = new Set()) {
  return items.flatMap(item => {
    if (item.kind !== 'tool' || !agents.has(item.id) || done.has(item.id)) return [item];
    done.add(item.id);
    return [item, ...withSubagents(subagentItems(agents.get(item.id), item.id), agents, done)];
  });
}

/**
 * @param {{extras?:object[], sent?:object}} session
 * @param {{id:string, lines:object[]|null, subagents?:Map<string, object[]>, leaf?:string|null, current?:boolean}[]}
 *   conversations oldest first (the ones before each /clear, then the current one); lines null when the CLI has no file
 *   for it yet; subagents by the id of the tool call that started each (transcripts.readSubagents)
 * @returns {{items:object[], chains:object[][]}} chains: each conversation's lines as shown
 * @example buildItems(session, [{ id, lines, current: true }]).items
 */
function buildItems(session, conversations) {
  const chains = conversations.map(conversation => (conversation.lines ? chainOf(conversation.lines, conversation.leaf) : []));
  const shownUuids = new Set(chains.flat().map(line => line.uuid));
  const extrasAfter = new Map(); // a line's uuid, or '' for the start of the current conversation -> GUI items
  for (const extra of session.extras || []) {
    const anchors = extra.anchors || [];
    const key = anchors.length ? anchors.find(uuid => shownUuids.has(uuid)) : '';
    if (key === undefined) continue;
    extrasAfter.set(key, [...(extrasAfter.get(key) || []), extra.item]);
  }
  const display = displayOf(session.sent || {});
  const items = [];
  const startOfCurrent = () => items.push(...(extrasAfter.get('') || []));
  conversations.forEach((conversation, index) => {
    if (conversation.current) startOfCurrent();
    // The CLI cannot resume at an answer before its last compaction (it holds a summary instead): no rewind point there.
    const boundary = chains[index].findLastIndex(line => line.subtype === 'compact_boundary');
    let lastAssistant = null;
    chains[index].forEach((line, position) => {
      if (position === boundary) lastAssistant = false;
      const own = lineItems(line, { conversation: conversation.id, lastAssistant: position < boundary ? false : lastAssistant, display });
      items.push(...withSubagents(own, conversation.subagents || new Map()));
      if (line.type === 'assistant') lastAssistant = line.uuid;
      items.push(...(extrasAfter.get(line.uuid) || []));
    });
  });
  if (!conversations.some(conversation => conversation.current)) startOfCurrent();
  return { items, chains };
}

module.exports = { buildItems };
