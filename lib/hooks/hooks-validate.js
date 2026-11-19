/** Validation of a hook request: enums, length caps, and which events take a matcher. */
const { httpError } = require('../http-utils');

const EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'PreCompact', 'SessionStart', 'SessionEnd'];
const SCOPES = ['user', 'project', 'local'];
const MATCHER_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'Notification', 'PreCompact', 'SessionStart']); // the others take none
const LIMITS = { command: 8000, matcher: 200, timeoutMax: 3600 };

/**
 * @param {object} input { scope, event, command, matcher?, timeout? }
 * @returns {{scope:string, event:string, command:string, matcher:string, timeout:number|null}} cleaned; the matcher of an
 *   event that takes none is dropped. Throws a 400.
 */
function validateHook(input) {
  const { scope, event, command, matcher = '', timeout } = input || {};
  if (!SCOPES.includes(scope)) throw httpError(400, 'יעד שמירה לא תקין');
  if (!EVENTS.includes(event)) throw httpError(400, 'אירוע לא תקין');
  if (typeof command !== 'string' || !command.trim()) throw httpError(400, 'חסרה פקודה');
  if (command.length > LIMITS.command) throw httpError(400, `הפקודה ארוכה מדי (עד ${LIMITS.command} תווים)`);
  if (typeof matcher !== 'string' || matcher.length > LIMITS.matcher) throw httpError(400, `matcher לא תקין (עד ${LIMITS.matcher} תווים)`);
  const hasTimeout = timeout !== undefined && timeout !== null && timeout !== '';
  if (hasTimeout && (!Number.isInteger(timeout) || timeout < 1 || timeout > LIMITS.timeoutMax)) throw httpError(400, `timeout חייב להיות מספר שלם בין 1 ל-${LIMITS.timeoutMax} שניות`);
  return { scope, event, command, matcher: MATCHER_EVENTS.has(event) ? matcher.trim() : '', timeout: hasTimeout ? timeout : null };
}

/** @returns {{scope:string, event:string, groupIndex:number, hookIndex:number, command:string, matcher:string}} the address plus what the client saw */
function addressOf(input) {
  const { scope, event, groupIndex, hookIndex, command, matcher = '' } = input || {};
  if (!SCOPES.includes(scope) || !EVENTS.includes(event) || !Number.isInteger(groupIndex) || !Number.isInteger(hookIndex) || typeof command !== 'string' || typeof matcher !== 'string') throw httpError(400, 'כתובת hook לא תקינה');
  return { scope, event, groupIndex, hookIndex, command, matcher };
}

module.exports = { EVENTS, SCOPES, validateHook, addressOf };
