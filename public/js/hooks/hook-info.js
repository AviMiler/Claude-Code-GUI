/** What the hook form knows about each event: a Hebrew explanation, the stdin and exit-code-2 hint, and matcher suggestions. */
const TOOLS = ['Bash', 'Edit', 'Write', 'MultiEdit', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'Edit|Write', 'Edit|MultiEdit|Write', 'mcp__.*'];
const STDIN = 'ה-hook מקבל JSON ב-stdin (session_id, transcript_path, cwd, hook_event_name';

export const HOOK_EVENTS = [
  { name: 'PreToolUse', summary: 'לפני שכלי רץ: אפשר לאשר, לחסום או לשנות', matchers: TOOLS, matcherLabel: 'שם הכלי',
    hint: `${STDIN}, tool_name, tool_input). קוד יציאה 2 חוסם את הכלי ושולח את stderr ל-Claude.` },
  { name: 'PostToolUse', summary: 'אחרי שכלי הסתיים בהצלחה: בדיקות, פורמט, רישום', matchers: TOOLS, matcherLabel: 'שם הכלי',
    hint: `${STDIN}, tool_name, tool_input, tool_response). הכלי כבר רץ; קוד יציאה 2 שולח את stderr ל-Claude.` },
  { name: 'UserPromptSubmit', summary: 'כשהמשתמש שולח הודעה, לפני ש-Claude מעבד אותה', matchers: null,
    hint: `${STDIN}, prompt). ה-stdout מצטרף להקשר. קוד יציאה 2 חוסם את ההודעה ומוחק אותה; stderr מוצג למשתמש.` },
  { name: 'Notification', summary: 'כש-Claude שולח התראה (בקשת הרשאה, המתנה לקלט)', matchers: ['permission_prompt', 'idle_prompt'], matcherLabel: 'סוג ההתראה',
    hint: `${STDIN}, message). אי אפשר לחסום: קוד יציאה 2 רק מציג את stderr למשתמש.` },
  { name: 'Stop', summary: 'כש-Claude מסיים לענות: אפשר לדרוש ממנו להמשיך', matchers: null,
    hint: `${STDIN}, stop_hook_active). קוד יציאה 2 מונע את העצירה ושולח את stderr ל-Claude להמשך עבודה.` },
  { name: 'SubagentStop', summary: 'כש-subagent (כלי Task) מסיים', matchers: null,
    hint: `${STDIN}, stop_hook_active). כמו Stop: קוד יציאה 2 מונע מה-subagent לעצור.` },
  { name: 'PreCompact', summary: 'לפני דחיסת ההקשר (/compact)', matchers: ['manual', 'auto'], matcherLabel: 'ידני או אוטומטי',
    hint: `${STDIN}, trigger, custom_instructions). אי אפשר לחסום: קוד יציאה 2 רק מציג את stderr למשתמש.` },
  { name: 'SessionStart', summary: 'כשסשן מתחיל או ממשיך', matchers: ['startup', 'resume', 'clear', 'compact'], matcherLabel: 'סוג ההתחלה',
    hint: `${STDIN}, source). ה-stdout מצטרף להקשר של Claude. קוד יציאה 2 רק מציג את stderr למשתמש.` },
  { name: 'SessionEnd', summary: 'כשסשן מסתיים: ניקוי ורישום', matchers: null,
    hint: `${STDIN}, reason). אי אפשר לחסום: קוד יציאה 2 רק מציג את stderr למשתמש.` },
];

export const HOOK_SCOPES = [
  { value: 'user', label: 'משתמש (~/.claude/settings.json)' },
  { value: 'project', label: 'פרויקט משותף (.claude/settings.json)' },
  { value: 'local', label: 'פרויקט מקומי (.claude/settings.local.json)' },
];
export const SCOPE_LABEL = { user: 'משתמש', project: 'פרויקט', local: 'מקומי' };
export const eventInfo = name => HOOK_EVENTS.find(event => event.name === name);

/** The JSON written for a hook: { hooks: { <Event>: [{ matcher?, hooks: [{ type, command, timeout? }] }] } }. */
export function hookPreview({ event, matcher, command, timeout }) {
  const entry = { type: 'command', command: command || '', ...(timeout ? { timeout } : {}) };
  return JSON.stringify({ hooks: { [event]: [{ ...(matcher ? { matcher } : {}), hooks: [entry] }] } }, null, 2);
}
