/**
 * The confirmation before a dev server starts: the full path of the program that runs (resolved on the server, never a
 * bare name a project file could stand in for), the arguments, folder, port and the configuration's variables with their
 * values, as the server read them from `.claude/launch.json`. Nothing starts without it (user decision 2026-11-19).
 * Text only (textContent).
 */
import { h } from '../dom.js';
import { ask } from '../ui.js';

/** One argument as a reader can copy it: quoted (JSON style) when it is empty or has spaces or quotes. */
const showArg = arg => (arg === '' || /[\s"'\\]/.test(arg) ? JSON.stringify(arg) : arg);

/** @param {string} program @param {string[]} args @returns {string} the command line as shown */
export const formatCommand = (program, args) => [showArg(program), ...args.map(showArg)].join(' ');

const row = (label, value) => h('div', { class: 'launch-confirm-row' }, h('span', { class: 'launch-confirm-label' }, label),
  h('code', { dir: 'ltr' }, value));

const SCRUB_NOTE = 'לשרת לא מועברים משתני Claude והממשק (ANTHROPIC_*, CLAUDE_*) וכל משתנה ששמו נראה כמו סוד (TOKEN, KEY, SECRET, AUTH, PASSWORD, CREDENTIAL).';

/**
 * @param {{name:string, program:string, args:string[], cwd:string, port:number|null, url:string|null, env:Object<string,string>}} entry
 * @returns {Promise<boolean>} the user confirmed
 */
export function confirmLaunch(entry) {
  const vars = Object.entries(entry.env || {}).map(([key, value]) => `${key}=${value}`).join('\n');
  const details = h('div', { class: 'launch-confirm' },
    row('פקודה (נתיב מלא)', formatCommand(entry.program, entry.args)),
    row('תיקייה', entry.cwd),
    entry.port ? row('פורט', String(entry.port)) : null,
    entry.url ? row('כתובת', entry.url) : null,
    vars ? row('משתני סביבה מהקובץ', vars) : null,
    h('p', { class: 'launch-confirm-note' }, SCRUB_NOTE));
  return ask({
    title: `להפעיל את "${entry.name}"?`,
    text: 'הפקודה הזאת תרוץ במחשב שלך עכשיו, בלי Claude ובלי בקשת הרשאה, מתוך .claude/launch.json של הסשן. הפעל רק אם אתה מכיר אותה.',
    details,
    confirmLabel: 'הפעלה',
  });
}
