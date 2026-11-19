const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createScheduleStore } = require('../lib/schedule/schedule-store');
const { createRunner } = require('../lib/schedule/runner');
const { nextRun, latestBetween } = require('../lib/schedule/schedule-time');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
const MIN = 60000; const HOUR = 60 * MIN; const DAY = 24 * HOUR;
const flush = () => new Promise(resolve => setImmediate(resolve));
const local = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime(); // the process's own zone, like the runner

function fakeClock(start) {
  let time = start; let seq = 0; const timers = new Map();
  return {
    now: () => time, live: () => timers.size,
    timers: { set: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: time + ms }); return id; }, clear: id => timers.delete(id) },
    async advance(ms) {
      const end = time + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); time = Math.max(time, due[1].at); due[1].fn(); await flush();
      }
      time = end; await flush();
    },
  };
}

let fileCount = 0;
function setup(start) {
  const clock = fakeClock(start);
  const file = path.join(dir, `r${++fileCount}.json`);
  const store = createScheduleStore({ file, now: clock.now });
  const sessions = new Map(); const launched = [];
  const runner = createRunner({
    store, now: clock.now, timers: clock.timers, watchEveryMs: 1000,
    launch: async task => { const id = `s${launched.length + 1}`; launched.push(task.id); sessions.set(id, { status: 'running', pending: 0, lastEventAt: clock.now(), outcome: 'done', errorText: '', userTurns: 1 }); return id; },
    inspect: id => sessions.get(id) || null, stop: async () => {}, settings: () => ({ approvalMs: 30 * MIN, stallMs: 10 * MIN, stallStopMs: 0 }),
  });
  const endAll = () => { for (const session of sessions.values()) session.status = 'idle'; };
  return { clock, store, runner, launched, endAll, file };
}
const task = schedule => ({ name: 't', prompt: 'p', folder: dir, mode: 'acceptEdits', model: '', effort: '', active: true, schedule: { kind: 'rule', v: 1, days: {}, catchUp: 'latest', ...schedule } });

test('maxRuns: started runs count, skips and "run now" do not; then the task is done, not in error', async () => {
  const env = setup(local(19, 8));
  const made = env.store.create(task({ pattern: { type: 'interval', every: 5, unit: 'minutes', start: local(19, 8, 5) }, maxRuns: 2 }));
  env.runner.start();
  await env.clock.advance(5 * MIN); // run 1
  await env.clock.advance(5 * MIN); // still running: skipped
  env.endAll();
  await env.clock.advance(2000);
  env.runner.runNow(env.store.get(made.id)); // manual
  await env.clock.advance(1000);
  env.endAll();
  await env.clock.advance(5 * MIN); // run 2
  const stored = env.store.get(made.id);
  assert.equal(stored.runsDone, 2);
  assert.equal(stored.done, true);
  assert.equal(stored.active, false);
  assert.equal(stored.error, undefined);
  assert.match(stored.doneNote, /2 הרצות/);
  assert.equal(env.runner.nextRunOf(stored), null);
  await env.clock.advance(HOUR);
  assert.equal(env.launched.length, 3);
});

test('delay: a time inside a quiet window runs once at its end, flagged delayed', async () => {
  const env = setup(local(19, 5, 58));
  const made = env.store.create(task({ pattern: { type: 'times', times: ['23:00', '23:30'] }, windows: { mode: 'except', ranges: [{ from: '22:00', to: '06:00' }], onExcluded: 'delay' } }));
  env.runner.start();
  await env.clock.advance(3 * MIN);
  const runs = env.store.get(made.id).runs;
  assert.equal(runs.length, 1);
  assert.equal(runs[0].delayed, true);
  assert.equal(runs[0].occurrence, local(19, 6));
});

test('catch-up: "latest" runs one missed run at start, "none" runs none', async () => {
  for (const [catchUp, expected] of [['latest', 1], ['none', 0]]) {
    const env = setup(local(19, 12));
    const made = env.store.create(task({ pattern: { type: 'times', times: ['08:05'] }, catchUp }));
    env.store.update(made.id, { since: local(19, 12) - 3 * DAY });
    env.runner.start();
    await env.clock.advance(10);
    assert.equal(env.launched.length, expected, catchUp);
    if (expected) assert.equal(env.store.get(made.id).runs[0].catchUp, true);
  }
});

test('once: runs at its time and is then done; one missed beyond 7 days is done with a note', async () => {
  const env = setup(local(19, 8));
  const made = env.store.create(task({ pattern: { type: 'once', at: local(19, 8, 10) } }));
  const missed = env.store.create(task({ pattern: { type: 'once', at: local(19, 8) - 9 * DAY } }));
  env.store.update(missed.id, { since: local(19, 8) - 10 * DAY });
  env.runner.start();
  assert.equal(env.store.get(missed.id).done, true);
  assert.match(env.store.get(missed.id).doneNote, /הוחמצה/);
  await env.clock.advance(10 * MIN);
  assert.deepEqual(env.launched, [made.id]);
  assert.equal(env.store.get(made.id).done, true);
  assert.doesNotMatch(env.store.get(made.id).doneNote, /הוחמצה/);
});

test('a stored task with an unknown kind loads paused with an error badge', () => {
  const env = setup(local(19, 8));
  fs.writeFileSync(env.file, JSON.stringify({ version: 1, tasks: [{ id: 'x', name: 'n', active: true, schedule: { kind: 'someday' }, runs: [] }] }));
  const store = createScheduleStore({ file: env.file });
  const runner = createRunner({ store, timers: { set: () => 1, clear: () => {} }, launch: async () => 'x', inspect: () => null, stop: async () => {}, settings: () => ({}) });
  runner.start();
  assert.equal(store.get('x').active, false);
  assert.match(store.get('x').error, /הושהתה.*לא מוכר/);
  assert.equal(store.get('x').schedule.kind, 'someday'); // never rewritten
});

test('an old hours schedule and a rule interval with start = anchor give identical times', () => {
  const anchor = local(10, 7, 13);
  const hours = { kind: 'hours', every: 3, anchor };
  const rule = { kind: 'rule', v: 1, pattern: { type: 'interval', every: 3, unit: 'hours', start: anchor }, days: {}, catchUp: 'latest' };
  let [a, b] = [local(19, 8), local(19, 8)];
  for (let index = 0; index < 20; index++) { a = nextRun(hours, a); b = nextRun(rule, b); assert.equal(a, b); }
  assert.deepEqual(latestBetween(rule, local(19, 0), local(19, 12)), { ...latestBetween(hours, local(19, 0), local(19, 12)), delayed: false });
});

test('reschedule() (create, edit, pause, resume) leaves one timer, never a second loop', async () => {
  const env = setup(local(19, 8));
  env.store.create(task({ pattern: { type: 'times', times: ['09:00'] } }));
  env.runner.start();
  for (let index = 0; index < 5; index += 1) env.runner.reschedule();
  assert.equal(env.clock.live(), 1);
  await env.clock.advance(30 * MIN); // before the 09:00 run (a live run adds the watch timer)
  assert.equal(env.clock.live(), 1);
});
