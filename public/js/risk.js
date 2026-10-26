/**
 * Warnings before significant actions. Nothing is blocked: the user sees what the action really does and confirms.
 * Why central: panels get `guardedApi` instead of `api`, so no panel can write settings or install code unwarned.
 */
import { api } from './api.js';
import { ask } from './ui.js';

/** Slash commands that act on the Anthropic account or start work outside this computer (from the 2.1.246 catalog). */
const OUTWARD_COMMANDS = {
  'design-sync': 'מעלה קוד של מערכת עיצוב ל-claude.ai/design.',
  design: 'מעניק או מבטל ל-Claude גישה לפרויקטי Design בחשבון.',
  'design-consent': 'מעניק ל-Claude גישה לפרויקטי Design בחשבון.',
  'design-revoke': 'מבטל ל-Claude גישה לפרויקטי Design בחשבון.',
  schedule: 'יוצר או מריץ סוכני ענן מתוזמנים (routines) בחשבון.',
  ultrareview: 'מפעיל סוכן ענן לסקירת קוד. עלות: בערך $5–$25.',
  'usage-credits': 'משנה הגדרות קרדיטים וחיוב בחשבון, או שולח בקשה למנהל.',
  'extra-usage': 'משנה הגדרות קרדיטים וחיוב בחשבון.',
};
const SENSITIVE_SETTINGS = {
  hooks: 'hooks – פקודות שירוצו אוטומטית באירועים (לפני/אחרי כלים, בתחילת סשן…)',
  env: 'env – משתני סביבה לכל הרצה (כתובת שרת, טוקנים…)',
  apiKeyHelper: 'apiKeyHelper – פקודה שמפיקה מפתח API',
  awsAuthRefresh: 'awsAuthRefresh – פקודת אימות', awsCredentialExport: 'awsCredentialExport – פקודת אימות',
  statusLine: 'statusLine – פקודה שרצה כל הזמן', enableAllProjectMcpServers: 'אישור אוטומטי לכל שרתי ה-MCP של פרויקטים',
  enabledPlugins: 'הפעלת פלאגינים', extraKnownMarketplaces: 'מקורות פלאגינים נוספים',
};

export const CANCELLED_MESSAGE = 'הפעולה בוטלה';

class CancelledError extends Error {
  constructor() { super(CANCELLED_MESSAGE); this.cancelled = true; }
}

/** Shows the reasons and resolves when confirmed; throws CancelledError otherwise. No reasons -> no dialog. */
export async function confirmRisk(title, reasons, confirmLabel = 'כן, להמשיך') {
  if (!reasons.length) return;
  const text = `${reasons.map(reason => `• ${reason}`).join('\n')}\n\nלהמשיך?`;
  if (!await ask({ title, text, confirmLabel, danger: true })) throw new CancelledError();
}

const parse = text => { try { return text?.trim() ? JSON.parse(text) : {}; } catch { return {}; } };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Why saving this Claude file deserves a second look. */
async function fileReasons(scope, kind, name, content) {
  const reasons = [];
  if (kind.endsWith('-user')) reasons.push('הקובץ נמצא ב-~/.claude ומשפיע על כל הפרויקטים שלך, לא רק על התיקייה הזו.');
  if (!kind.startsWith('settings-')) return reasons;
  const before = parse((await api.readClaudeFile(scope, kind, name).catch(() => null))?.content);
  const after = parse(content);
  for (const [key, label] of Object.entries(SENSITIVE_SETTINGS)) {
    if (!same(before[key], after[key])) reasons.push(`שינוי ב-${label}`);
  }
  const added = (after.permissions?.allow || []).filter(rule => !(before.permissions?.allow || []).includes(rule));
  if (added.length) reasons.push(`הרשאות allow חדשות (בלי לשאול): ${added.join(', ')}`);
  if (after.permissions?.defaultMode === 'bypassPermissions' && before.permissions?.defaultMode !== 'bypassPermissions') {
    reasons.push('מצב ברירת מחדל "הכול מותר" – Claude יריץ כל פקודה בלי לשאול');
  }
  return reasons;
}

/** Why this `claude ...` management command deserves a second look. */
function cliReasons(args) {
  const [group, action, sub] = args;
  const scope = args[args.indexOf('--scope') + 1];
  const reasons = [];
  if (group === 'mcp' && (action === 'add' || action === 'add-json')) {
    const command = args.includes('--') ? args.slice(args.indexOf('--') + 1).join(' ') : args[args.length - 1];
    reasons.push(`Claude Code יריץ או יתחבר לשרת הזה בכל סשן: ${command}`);
    if (scope === 'user') reasons.push('היקף "משתמש" – השרת יהיה פעיל בכל הפרויקטים שלך.');
    if (scope === 'project') reasons.push('היקף "פרויקט" – נשמר ב-.mcp.json שמשותף עם כל מי שמשתמש בתיקייה.');
  }
  if (group === 'plugin' && ['install', 'update', 'enable'].includes(action)) {
    reasons.push('פלאגין הוא קוד (פקודות, hooks, שרתי MCP) שירוץ בתוך Claude Code.');
  }
  if (group === 'plugin' && action === 'marketplace' && (sub === 'add' || sub === 'update')) {
    reasons.push('מוסיף/מעדכן מקור פלאגינים מהרשת או מתיקייה – הקוד שבו יוכל להיות מותקן.');
  }
  return reasons;
}

/** Same interface as `api`, with confirmations on the significant calls. Used by every panel. */
export const guardedApi = {
  ...api,
  async writeClaudeFile(scope, kind, name, content) {
    await confirmRisk('שינוי הגדרות של Claude', await fileReasons(scope, kind, name, content), 'שמירה');
    return api.writeClaudeFile(scope, kind, name, content);
  },
  async cli(args, cwd) {
    await confirmRisk(`claude ${args.slice(0, 3).join(' ')}`, cliReasons(args));
    return api.cli(args, cwd);
  },
};

/** Before sending a slash command that reaches the account or the cloud. */
export function confirmOutwardCommand(text) {
  const name = (text.trim().match(/^\/([^\s]+)/) || [])[1];
  const reason = name && OUTWARD_COMMANDS[name];
  return confirmRisk(`/${name} פועל מחוץ למחשב`, reason ? [reason, 'במחשב הסגור (בלי claude.ai) הפקודה פשוט תיכשל.'] : []);
}

/** Before switching a session to a mode that runs tools without asking. */
export function confirmMode(mode) {
  if (mode === 'bypassPermissions') {
    return confirmRisk('מצב "הכול מותר"', ['Claude יריץ כל פקודה, יערוך ויוכל למחוק קבצים, ויפנה לרשת – בלי לשאול אותך.',
      'כולל פקודות שמשנות הגדרות מערכת או שולחות בקשות לשרתים אחרים ברשת (למשל שרת המודל).'], 'להפעיל');
  }
  if (mode === 'auto') return confirmRisk('מצב אוטומטי', ['מסווג אוטומטי מחליט מה לאשר במקומך.'], 'להפעיל');
  return Promise.resolve();
}

export const isCancelled = error => Boolean(error?.cancelled);
