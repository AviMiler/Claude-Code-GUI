const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
process.env.CLAUDE_GUI_DATA = dataDir; // session-options loads session-store
process.on('exit', () => fs.rmSync(dataDir, { recursive: true, force: true }));
const { validateTask, validateSchedule } = require('../lib/schedule/schedule-validate');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
process.on('exit', () => fs.rmSync(folder, { recursive: true, force: true }));
const checkFolder = value => { if (!fs.existsSync(value)) throw Object.assign(new Error('התיקייה לא קיימת'), { status: 400 }); return value; };
const rules = { modes: ['default', 'acceptEdits', 'plan', 'bypassPermissions'], checkFolder, now: Date.UTC(2026, 10, 16) };
const good = { name: ' דוח ', prompt: 'סכם', folder, schedule: { kind: 'daily', time: '09:00' } };
const rejects = (body, pattern) => assert.throws(() => validateTask(body, rules), error => error.status === 400 && (!pattern || pattern.test(error.message)));

test('a valid task is rebuilt from known fields with defaults', () => {
  const task = validateTask({ ...good, extra: 'x', id: 'evil' }, rules);
  assert.deepEqual(task, { name: 'דוח', prompt: 'סכם', folder: path.resolve(folder), mode: 'acceptEdits', model: '', effort: '', active: true, schedule: { kind: 'daily', time: '09:00' } });
  assert.equal(validateTask({ ...good, mode: 'manual' }, rules).mode, 'default');
});

test('rejects bad names, prompts, folders, modes, model, effort and active', () => {
  rejects({ ...good, name: '' }); rejects({ ...good, name: 'x'.repeat(81) }); rejects({ ...good, prompt: 5 });
  rejects({ ...good, prompt: 'x'.repeat(20001) }, /ארוך/);
  rejects({ ...good, folder: 'relative/path' }, /נתיב מלא/);
  rejects({ ...good, folder: path.join(folder, 'missing') });
  rejects({ ...good, mode: 'dontAsk' }); rejects({ ...good, mode: 'yolo' });
  rejects({ ...good, model: 'a b' }); rejects({ ...good, effort: 'huge' }); rejects({ ...good, active: 'yes' });
});

test('schedules: times, days, hours, cron and never-matching ones', () => {
  const now = rules.now;
  for (const bad of [null, { kind: 'often' }, { kind: 'daily', time: '24:00' }, { kind: 'daily', time: '9:00' }, { kind: 'weekdays' },
    { kind: 'weekly', days: [], time: '09:00' }, { kind: 'weekly', days: [7], time: '09:00' }, { kind: 'hours', every: 0 },
    { kind: 'hours', every: 25 }, { kind: 'hours', every: 1.5 }, { kind: 'cron', expression: '* * *' }, { kind: 'cron', expression: '0 0 31 2 *' }]) {
    assert.throws(() => validateSchedule(bad, now), error => error.status === 400, JSON.stringify(bad));
  }
  assert.deepEqual(validateSchedule({ kind: 'weekly', days: [3, 1, 3], time: '07:30' }, now), { kind: 'weekly', days: [1, 3], time: '07:30' });
  assert.deepEqual(validateSchedule({ kind: 'cron', expression: ' 0  9 * * 1-5 ' }, now), { kind: 'cron', expression: '0 9 * * 1-5' });
  const hours = validateSchedule({ kind: 'hours', every: 3 }, now);
  assert.equal(hours.anchor, now);
  assert.equal(validateSchedule({ kind: 'hours', every: 3 }, now + 5000, hours).anchor, now); // unchanged: keeps its anchor
  assert.notEqual(validateSchedule({ kind: 'hours', every: 4 }, now + 60000, hours).anchor, now);
});
