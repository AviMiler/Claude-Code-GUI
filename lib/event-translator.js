/**
 * Converts Claude Code `stream-json` events into UI items.
 * Why isolated: the CLI event format is the part most likely to change between versions,
 * so all knowledge of it lives in this file (live events and saved transcripts share it).
 */
const { ANSI_PATTERN } = require('./spawn-utils');

const MAX_RESULT_CHARS = 20000;
const LOCAL_STDOUT = /<local-command-(stdout|stderr)>([\s\S]*?)<\/local-command-\1>/g;
const NOTICE_SUBTYPES = new Set(['informational', 'notification']);

function stringifyContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(block => (block.type === 'image' ? '[תמונה]' : block.text ?? '')).join('\n');
  }
  return JSON.stringify(content ?? '');
}

function truncate(text) {
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n… (קוצר)` : text;
}

const clean = text => String(text ?? '').replace(ANSI_PATTERN, '').trim();

/** Output of slash commands such as /cost arrives wrapped in tags inside a user message. */
function localCommandOutput(text) {
  const parts = [...String(text).matchAll(LOCAL_STDOUT)].map(match => clean(match[2])).filter(Boolean);
  return parts.length ? { kind: 'command-output', text: parts.join('\n\n') } : null;
}

function translateAssistant(event) {
  const parent = event.parent_tool_use_id || null;
  const items = [];
  for (const block of event.message?.content ?? []) {
    if (block.type === 'text' && block.text.trim()) items.push({ kind: 'text', text: block.text, parent });
    if (block.type === 'thinking' && block.thinking?.trim()) items.push({ kind: 'thinking', text: block.thinking, parent });
    if (block.type === 'tool_use') items.push({ kind: 'tool', id: block.id, name: block.name, input: block.input, parent });
  }
  return items;
}

function translateUser(event) {
  const content = event.message?.content;
  if (typeof content === 'string') return [localCommandOutput(content)].filter(Boolean);
  if (!Array.isArray(content)) return [];
  const items = [];
  for (const block of content) {
    if (block.type === 'tool_result') {
      items.push({
        kind: 'tool-result', toolUseId: block.tool_use_id, parent: event.parent_tool_use_id || null,
        text: truncate(stringifyContent(block.content)), isError: Boolean(block.is_error),
      });
    } else if (block.type === 'text') {
      const output = localCommandOutput(block.text);
      if (output) items.push(output);
    }
  }
  return items;
}

function translateResult(event) {
  const isError = Boolean(event.is_error) || (event.subtype && event.subtype !== 'success');
  return [{
    kind: 'result', isError, subtype: event.subtype || 'success',
    text: isError ? String(event.result ?? event.errors?.join('\n') ?? '') : '', // success text was already shown
    durationMs: event.duration_ms ?? 0, durationApiMs: event.duration_api_ms ?? 0, costUsd: event.total_cost_usd ?? null, turns: event.num_turns ?? 0,
    usage: event.usage ? {
      input: event.usage.input_tokens ?? 0, output: event.usage.output_tokens ?? 0,
      cacheRead: event.usage.cache_read_input_tokens ?? 0, cacheWrite: event.usage.cache_creation_input_tokens ?? 0,
    } : null,
  }];
}

function translateSystem(event) {
  if (event.subtype === 'local_command_output') return [{ kind: 'command-output', text: clean(event.content) }];
  if (event.subtype === 'compact_boundary') return [{ kind: 'divider', text: 'השיחה נדחסה (compact)' }];
  if (event.subtype === 'api_retry') {
    return [{ kind: 'notice', text: `ניסיון חוזר מול ה-API (${event.attempt ?? '?'}/${event.max_retries ?? '?'})` }];
  }
  if (event.subtype === 'task_started' && event.description) {
    return [{ kind: 'notice', text: `משימת רקע התחילה: ${event.description}` }];
  }
  if (event.subtype === 'task_notification' && event.summary) {
    return [{ kind: 'notice', text: `משימת רקע (${event.status || 'עודכנה'}): ${event.summary}` }];
  }
  if (NOTICE_SUBTYPES.has(event.subtype) && (event.content || event.text)) {
    return [{ kind: 'notice', text: clean(event.content || event.text), level: event.level || event.color || 'info' }];
  }
  return [];
}

/**
 * @param {object} event Parsed JSON line from `claude -p --output-format stream-json` (or a transcript line).
 * @returns {object[]} UI items (kind: text | thinking | tool | tool-result | result | command-output | divider | notice).
 * @example translateEvent({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } })
 */
function translateEvent(event) {
  if (event.type === 'assistant') return translateAssistant(event);
  if (event.type === 'user') return event.isReplay ? [] : translateUser(event);
  if (event.type === 'result') return translateResult(event);
  if (event.type === 'system') return translateSystem(event);
  return [];
}

/**
 * Token streaming (`--include-partial-messages`). Only top-level text and thinking are streamed.
 * @returns {{kind:'text'|'thinking', text:string}|null}
 */
function translateDelta(event) {
  if (event.type !== 'stream_event' || event.parent_tool_use_id) return null;
  const delta = event.event?.type === 'content_block_delta' ? event.event.delta : null;
  if (delta?.type === 'text_delta') return { kind: 'text', text: delta.text };
  if (delta?.type === 'thinking_delta') return { kind: 'thinking', text: delta.thinking };
  return null;
}

const TASK_END_STATUSES = new Set(['completed', 'failed', 'stopped', 'killed']);

/**
 * Background task (shell command, subagent, Monitor) from `system/task_started|task_progress|task_notification`.
 * @returns {{id:string, phase:'started'|'progress'|'ended', fields:object}|null} fields: only what this event knows
 */
function readTaskEvent(event) {
  if (event.type !== 'system' || !event.task_id) return null;
  const usage = event.usage ? { tokens: event.usage.total_tokens ?? null, toolUses: event.usage.tool_uses ?? null,
    durationMs: event.usage.duration_ms ?? null } : undefined;
  const common = { toolUseId: event.tool_use_id, description: event.description, summary: event.summary, usage };
  if (event.subtype === 'task_started') {
    return { id: event.task_id, phase: 'started', fields: { ...common, status: 'running', type: event.task_type,
      agent: event.subagent_type, background: event.is_backgrounded } };
  }
  if (event.subtype === 'task_progress') return { id: event.task_id, phase: 'progress', fields: { ...common, lastTool: event.last_tool_name } };
  if (event.subtype === 'task_notification') {
    const status = TASK_END_STATUSES.has(event.status) ? event.status : 'completed';
    return { id: event.task_id, phase: 'ended', fields: { ...common, status, outputFile: event.output_file || undefined } };
  }
  return null;
}

/** Facts from the `system/init` event (sent at the start of every turn). */
function readInit(event) {
  if (event.type !== 'system' || event.subtype !== 'init') return null;
  return {
    model: event.model, permissionMode: event.permissionMode, version: event.claude_code_version,
    tools: event.tools || [], mcpServers: event.mcp_servers || [], outputStyle: event.output_style,
    slashCommands: event.slash_commands || [], skills: event.skills || [], plugins: event.plugins || [],
  };
}

module.exports = { translateEvent, translateDelta, readInit, readTaskEvent, localCommandOutput };
