/**
 * Lines of a CLI conversation file as GUI items: the chain the CLI resumes, the text a user typed, the images they sent
 * (stored like composer attachments, lib/images.js, under an id from their bytes, so reading the file again gives the
 * same thumbnails), and the items of each line (the shared lib/event-translator.js).
 */
const { translateEvent, localCommandOutput } = require('../event-translator');
const images = require('../images');

const COMMAND_NAME = /<command-name>\/?([^<]*)<\/command-name>/;
const COMMAND_ARGS = /<command-args>([^<]*)<\/command-args>/;

const imageBlocks = line => (Array.isArray(line.message?.content) ? line.message.content.filter(block => block.type === 'image') : []);

/** The text of a user line as the CLI received it (text blocks joined), or of a message queued into a running turn. */
function rawText(line) {
  if (line.type === 'attachment') return String(line.attachment?.prompt ?? '');
  const content = line.message?.content;
  return typeof content === 'string' ? content
    : Array.isArray(content) ? content.filter(block => block.type === 'text').map(block => block.text).join('\n') : '';
}

/**
 * Text the user typed, or null for meta/tool lines.
 * @param {object} line @param {number} [markedImages] images shown as a "[תמונה]" marker (all of them, unless stored)
 */
function userText(line, markedImages = imageBlocks(line).length) {
  if (line.type !== 'user' || line.isMeta || line.isSidechain) return null;
  const text = rawText(line);
  if (markedImages && !text.startsWith('<')) return `${markedImages > 1 ? `[${markedImages} תמונות]` : '[תמונה]'}${text.trim() ? ` ${text}` : ''}`;
  const command = text.match(COMMAND_NAME);
  if (command) return `/${command[1]} ${(text.match(COMMAND_ARGS) || [, ''])[1]}`.trim();
  if (!text.trim() || text.startsWith('<') || text.startsWith('Caveat:')) return null;
  return text;
}

/**
 * Stores the base64 images of a user line one by one (the same checks as composer images: type, magic bytes, 5 MB).
 * @returns {{stored:{id:string, mediaType:string, name:string}[], failed:number}} failed: by URL/file, or rejected
 */
function storeImages(blocks) {
  const stored = [];
  let failed = 0;
  blocks.forEach((block, index) => {
    if (block.source?.type !== 'base64') { failed += 1; return; }
    try {
      stored.push(...images.saveImages([{ data: block.source.data, mediaType: block.source.media_type, name: `תמונה ${index + 1}` }], { stable: true }));
    } catch (error) {
      console.error('[transcripts] image not imported:', error.message);
      failed += 1;
    }
  });
  return { stored, failed };
}

/** A typed user line as a GUI item: its images stored and attached, the ones that could not be stored as a marker. */
function userItem(line) {
  const blocks = imageBlocks(line);
  const text = blocks.length ? line.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n') : '';
  // Lines whose text is a tag (command output…) never had their images marked; they are not stored either.
  if (!blocks.length || text.startsWith('<')) return { kind: 'user', text: userText(line) };
  const { stored, failed } = storeImages(blocks);
  return { kind: 'user', text: userText(line, failed) ?? '', ...(stored.length && { images: stored }) };
}

/** A subagent's lines as items inside the tool row that started it (`parent`), like they arrive live. */
const subagentItems = (lines, toolUseId) => lines.filter(line => !line.isMeta)
  .flatMap(line => translateEvent({ ...line, parent_tool_use_id: toolUseId }).filter(item => item.kind !== 'result'));

/**
 * The conversation as the CLI resumes it: from its latest line (or `leafUuid`, a rewind's point) back through
 * `parentUuid`. A compaction boundary has no parent; its `logicalParentUuid` leads on to the history before it. What a
 * rewind left behind, and subagent side chains, are not in it.
 * @returns {object[]} the lines, oldest first
 */
function chainOf(lines, leafUuid = null) {
  const main = lines.filter(line => line.uuid && !line.isSidechain);
  const byUuid = new Map(main.map(line => [line.uuid, line]));
  const chain = [];
  const seen = new Set();
  for (let line = leafUuid ? byUuid.get(leafUuid) : main.at(-1); line && !seen.has(line.uuid); line = byUuid.get(line.parentUuid ?? line.logicalParentUuid)) {
    seen.add(line.uuid);
    chain.push(line);
  }
  return chain.reverse();
}

/**
 * GUI items of one line of the chain.
 * @param {{conversation:string, lastAssistant:string|null|false, display:(line:object)=>object|null}} context lastAssistant:
 *   the answer before this line (a rewind to a user message resumes there; null: it starts the conversation, false: no
 *   answer the CLI can resume at); display: how the GUI showed a message it sent
 */
function lineItems(line, context) {
  if (line.isCompactSummary || line.isVisibleInTranscriptOnly) return []; // the summary the CLI wrote for itself
  if (line.type === 'attachment') {
    if (line.attachment?.type !== 'queued_command' || !rawText(line).trim()) return [];
    return [{ kind: 'user', text: rawText(line), correction: true, ...context.display(line) }]; // sent into a running turn
  }
  const shown = line.type === 'user' && !line.isMeta ? context.display(line) : null;
  const typed = shown || userText(line);
  if (typed) {
    return [{ ...(shown ? { kind: 'user', text: '' } : userItem(line)), ...shown, cliUuid: line.uuid, cliSession: context.conversation, afterUuid: context.lastAssistant }];
  }
  if (line.type === 'system' && line.subtype === 'local_command') {
    const output = localCommandOutput(line.content || '');
    return output ? [output] : [];
  }
  if (line.isMeta) return [];
  return translateEvent(line).filter(item => item.kind !== 'result');
}

module.exports = { rawText, userText, chainOf, lineItems, subagentItems };
