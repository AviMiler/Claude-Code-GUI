/**
 * Adds, edits and deletes Claude Code hooks in the three settings files (user, project, local) without touching any
 * other key. A file that is not valid JSON is never overwritten. The GUI's own verify Stop hook lives in a generated
 * --settings file, not in these files, so it is never listed or edited here.
 */
const fs = require('fs');
const path = require('path');
const { httpError } = require('../http-utils');
const { writeFileSafe } = require('../safe-file');
const { resolveKind } = require('../claude-files');

const EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'PreCompact', 'SessionStart', 'SessionEnd'];
const SCOPES = ['user', 'project', 'local'];
const LIMITS = { command: 8000, matcher: 200, timeoutMax: 3600 };

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const fileOf = (config, cwd, scope) => resolveKind(config, cwd, `settings-${scope}`);

/**
 * @param {object} input { scope, event, command, matcher?, timeout? }
 * @returns {{scope:string, event:string, command:string, matcher:string, timeout:number|null}} the cleaned input; throws a 400
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
  return { scope, event, command, matcher: matcher.trim(), timeout: hasTimeout ? timeout : null };
}

/** Reads a settings file: { file, settings }. Missing is {}; invalid JSON (or a non-object) throws a 400 and the file is left alone. */
function readSettings(config, cwd, scope) {
  const file = fileOf(config, cwd, scope);
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw httpError(500, `לא ניתן לקרוא את ${file}: ${error.message}`); }
  if (!text.trim()) return { file, settings: {} };
  let settings;
  try { settings = JSON.parse(text); } catch (error) { throw httpError(400, `הקובץ ${file} אינו JSON תקין, לא נכתב דבר: ${error.message}`); }
  if (!isObject(settings)) throw httpError(400, `הקובץ ${file} אינו אובייקט JSON, לא נכתב דבר`);
  return { file, settings };
}

function writeSettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileSafe(file, `${JSON.stringify(settings, null, 2)}\n`);
}

const hookEntry = ({ command, timeout }, base = {}) => {
  const entry = { ...base, type: 'command', command };
  if (timeout) entry.timeout = timeout; else delete entry.timeout;
  return entry;
};

/** Appends a hook to the group with the same matcher (or a new group). Mutates `settings`; returns the entry's group. */
function addTo(settings, hook, base) {
  if (settings.hooks !== undefined && !isObject(settings.hooks)) throw httpError(400, 'המפתח hooks בקובץ אינו אובייקט, לא נכתב דבר');
  settings.hooks = settings.hooks || {};
  if (settings.hooks[hook.event] !== undefined && !Array.isArray(settings.hooks[hook.event])) throw httpError(400, `hooks.${hook.event} בקובץ אינו מערך, לא נכתב דבר`);
  const groups = settings.hooks[hook.event] = settings.hooks[hook.event] || [];
  let group = groups.find(item => isObject(item) && (item.matcher || '') === hook.matcher && Array.isArray(item.hooks));
  if (!group) { group = { ...(hook.matcher ? { matcher: hook.matcher } : {}), hooks: [] }; groups.push(group); }
  group.hooks.push(hookEntry(hook, base));
}

/** Removes the hook at the address and cleans up empty groups, events and the hooks key. Returns the removed hook. */
function removeFrom(settings, { event, groupIndex, hookIndex }) {
  const group = settings.hooks?.[event]?.[groupIndex];
  const removed = group?.hooks?.[hookIndex];
  if (!removed) throw httpError(404, 'ה-hook לא נמצא (ייתכן שהקובץ השתנה)');
  group.hooks.splice(hookIndex, 1);
  if (!group.hooks.length) settings.hooks[event].splice(groupIndex, 1);
  if (!settings.hooks[event].length) delete settings.hooks[event];
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  return removed;
}

function addressOf(input) {
  const { scope, event, groupIndex, hookIndex } = input || {};
  if (!SCOPES.includes(scope) || !EVENTS.includes(event) || !Number.isInteger(groupIndex) || !Number.isInteger(hookIndex)) throw httpError(400, 'כתובת hook לא תקינה');
  return { scope, event, groupIndex, hookIndex };
}

/**
 * Every hook of the three files plus per-file status (a broken file is reported, not read).
 * @param {object} config @param {string} cwd the session's folder
 * @returns {{files:{scope:string,path:string,exists:boolean,error?:string}[], hooks:object[]}}
 */
function listHooks(config, cwd) {
  const files = [];
  const hooks = [];
  for (const scope of SCOPES) {
    const file = fileOf(config, cwd, scope);
    try {
      const { settings } = readSettings(config, cwd, scope);
      files.push({ scope, path: file, exists: fs.existsSync(file) });
      for (const [event, groups] of Object.entries(isObject(settings.hooks) ? settings.hooks : {})) {
        if (!EVENTS.includes(event) || !Array.isArray(groups)) continue;
        groups.forEach((group, groupIndex) => (isObject(group) && Array.isArray(group.hooks) ? group.hooks : []).forEach((hook, hookIndex) => {
          if (isObject(hook)) hooks.push({ scope, event, matcher: group.matcher || '', type: hook.type || 'command', command: hook.command || '', timeout: hook.timeout ?? null, groupIndex, hookIndex });
        }));
      }
    } catch (error) { files.push({ scope, path: file, exists: true, error: error.message }); }
  }
  return { files, hooks };
}

/**
 * Adds a command hook, merging into the existing file.
 * @param {object} config @param {string} cwd the session's folder @param {object} input see validateHook
 * @returns {{path:string}}
 */
function addHook(config, cwd, input) {
  const hook = validateHook(input);
  const { file, settings } = readSettings(config, cwd, hook.scope);
  addTo(settings, hook);
  writeSettings(file, settings);
  return { path: file };
}

/**
 * Replaces the hook at `input.from` ({scope, event, groupIndex, hookIndex}) with the new values; its other fields are kept.
 * @returns {{path:string}}
 */
function updateHook(config, cwd, input) {
  const hook = validateHook(input);
  const from = addressOf(input.from);
  if (from.scope !== hook.scope) throw httpError(400, 'אי אפשר להעביר hook בין קובצי הגדרות: מחק והוסף');
  const { file, settings } = readSettings(config, cwd, hook.scope);
  const group = settings.hooks?.[from.event]?.[from.groupIndex];
  const old = group?.hooks?.[from.hookIndex];
  if (old && from.event === hook.event && (group.matcher || '') === hook.matcher) group.hooks[from.hookIndex] = hookEntry(hook, old);
  else addTo(settings, hook, removeFrom(settings, from));
  writeSettings(file, settings);
  return { path: file };
}

/** Removes only the hook at the address; nothing else in the file changes. @returns {{path:string}} */
function deleteHook(config, cwd, input) {
  const address = addressOf(input);
  const { file, settings } = readSettings(config, cwd, address.scope);
  removeFrom(settings, address);
  writeSettings(file, settings);
  return { path: file };
}

module.exports = { EVENTS, SCOPES, validateHook, listHooks, addHook, updateHook, deleteHook };
