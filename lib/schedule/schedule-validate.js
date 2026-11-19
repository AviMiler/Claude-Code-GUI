/**
 * Server-side checks of a scheduled task as the browser sends it. Everything is rebuilt from known fields (nothing of
 * the request body is stored as is); errors are Hebrew, status 400.
 */
const path = require('path');
const { parseCron } = require('./cron');
const { nextRun } = require('./schedule-time');
const { validateRule } = require('./rule-validate');
const { checkText } = require('../session-options');

const LIMITS = { name: 80, prompt: 20000 };
const KINDS = ['manual', 'hours', 'daily', 'weekdays', 'weekly', 'cron', 'rule'];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim()) fail(`חסר ${label}`);
  const clean = value.trim();
  if (clean.length > max) fail(`${label} ארוך מדי (עד ${max} תווים)`);
  return clean;
}

function time(value) {
  if (typeof value !== 'string' || !TIME.test(value)) fail('השעה צריכה להיות בצורה HH:MM (00:00–23:59)');
  return value;
}

/**
 * @param {object} raw the schedule from the request
 * @param {number} now ms; the anchor of a new 'hours' schedule
 * @param {object} [previous] the stored schedule: an unchanged 'hours' schedule keeps its anchor
 * @returns {object} a clean schedule (schedule-time.js shapes)
 * @example validateSchedule({ kind: 'daily', time: '09:00' }, Date.now()) // { kind: 'daily', time: '09:00' }
 */
function validateSchedule(raw, now, previous) {
  if (!raw || typeof raw !== 'object' || !KINDS.includes(raw.kind)) fail('סוג תזמון לא מוכר');
  let schedule;
  switch (raw.kind) {
    case 'manual': schedule = { kind: 'manual' }; break;
    case 'hours': {
      if (!Number.isInteger(raw.every) || raw.every < 1 || raw.every > 24) fail('מספר השעות צריך להיות שלם בין 1 ל-24');
      const keep = previous?.kind === 'hours' && previous.every === raw.every && Number.isFinite(previous.anchor);
      schedule = { kind: 'hours', every: raw.every, anchor: keep ? previous.anchor : Math.ceil(now / 60000) * 60000 };
      break;
    }
    case 'weekly': {
      const days = Array.isArray(raw.days) ? [...new Set(raw.days)] : [];
      if (!days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) fail('בחר לפחות יום אחד בשבוע');
      schedule = { kind: 'weekly', days: days.sort(), time: time(raw.time) };
      break;
    }
    case 'cron':
      if (typeof raw.expression !== 'string' || raw.expression.length > 200) fail('ביטוי cron חסר או ארוך מדי');
      parseCron(raw.expression); // throws with the field that is wrong
      schedule = { kind: 'cron', expression: raw.expression.trim().split(/\s+/).join(' ') };
      break;
    case 'rule': schedule = validateRule(raw, now); break;
    default: schedule = { kind: raw.kind, time: time(raw.time) };
  }
  if (schedule.kind !== 'manual' && nextRun(schedule, now) === null) fail('התזמון הזה לעולם לא מתקיים');
  return schedule;
}

/**
 * @param {object} body the request body
 * @param {{modes:string[], checkFolder:(folder:string)=>string, now:number, previous?:object}} rules modes: the
 *   permission modes the CLI reports ('manual' already read as 'default'); checkFolder: createSession's folder check
 * @returns {{name, prompt, folder, mode, model, effort, active, schedule}}
 */
function validateTask(body, { modes, checkFolder, now, previous }) {
  if (!body || typeof body !== 'object') fail('בקשה לא תקינה');
  const folder = text(body.folder, 'תיקיית פרויקט', 1000);
  if (!path.isAbsolute(folder)) fail('תיקיית הפרויקט צריכה להיות נתיב מלא');
  const mode = body.mode === undefined ? 'acceptEdits' : body.mode === 'manual' ? 'default' : body.mode;
  if (!modes.includes(mode)) fail('מצב הרשאות שגרסת Claude Code המותקנת לא מכירה');
  if (body.active !== undefined && typeof body.active !== 'boolean') fail('ערך פעיל/מושהה לא תקין');
  return {
    name: text(body.name, 'שם', LIMITS.name), prompt: text(body.prompt, 'הוראות', LIMITS.prompt),
    folder: checkFolder(path.resolve(folder)), mode, model: checkText('model', body.model), effort: checkText('effort', body.effort),
    active: body.active ?? true, schedule: validateSchedule(body.schedule, now, previous?.schedule),
  };
}

module.exports = { validateTask, validateSchedule, LIMITS };
