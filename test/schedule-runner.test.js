const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createScheduleStore, MAX_RUNS } = require('../lib/schedule/schedule-store');
const { createRunner } = require('../lib/schedule/runner');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
const MIN = 60000; const HOUR = 60 * MIN; const DAY = 24 * HOUR;
const flush = () => new Promise(resolve => setImmediate(resolve));

/** A fake clock with timers that fire when it is advanced; `jump` moves the wall clock without firing (a sleep). */
function fakeClock(start) {
  let time = start; let seq = 0; const timers = new Map();
  return {
    now: () => time,
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
    jump(ms) { time += ms; },
    pending: () => timers.size,
  };
}

let fileCount = 0;
function setup({ start = Date.UTC(2026, 10, 16, 8, 0), sessions = new Map(), approvalMs = 30 * MIN } = {}) {
  const clock = fakeClock(start);
  const store = createScheduleStore({ file: path.join(dir, `s${++fileCount}.json`), now: clock.now });
  const launched = []; const stopped = [];
  const runner = createRunner({
    store, now: clock.now, timers: clock.timers, watchEveryMs: 1000,
    launch: async task => { const id = `s${launched.length + 1}`; launched.push(task.id); sessions.set(id, { status: 'running', pending: 0, lastEventAt: clock.now(), outcome: 'done', errorText: '' }); return id; },
    inspect: id => sessions.get(id) || null,
    stop: async id => { stopped.push(id); Object.assign(sessions.get(id), { status: 'idle', outcome: null, pending: 0 }); },
    settings: () => ({ approvalMs, stallMs: 10 * MIN }),
  });
  return { clock, store, runner, launched, stopped, sessions };
}
const daily = (time = '08:05') => ({ name: 't', prompt: 'p', folder: dir, mode: 'acceptEdits', model: '', effort: '', active: true, schedule: { kind: 'cron', expression: `${time.split(':')[1]} ${time.split(':')[0]} * * *` } });
const local = (h, m) => { const d = new Date(Date.UTC(2026, 10, 16, 8, 0)); d.setHours(h, m, 0, 0); return d.getTime(); };

test('fires a due run once, records it, follows it to its end, and arms only one timer', async () => {
  const env = setup({ start: local(8, 0) });
  const task = env.store.create(daily());
  env.runner.start();
  assert.equal(env.clock.pending(), 1);
  await env.clock.advance(4 * MIN);
  assert.equal(env.launched.length, 0);
  await env.clock.advance(2 * MIN);
  assert.equal(env.launched.length, 1);
  assert.equal(env.store.get(task.id).runs[0].outcome, 'running');
  assert.equal(env.store.get(task.id).runs[0].catchUp, false);
  Object.assign(env.sessions.get('s1'), { status: 'idle' });
  await env.clock.advance(2000);
  const run = env.store.get(task.id).runs[0];
  assert.equal(run.outcome, 'done');
  assert.equal(run.sessionId, 's1');
  assert.ok(run.durationMs > 0);
});

test('catch-up at start: one run for several missed, none older than 7 days, none before `since`', async () => {
  const env = setup({ start: local(12, 0) });
  const task = env.store.create(daily());
  env.store.update(task.id, { since: local(12, 0) - 3 * DAY });
  const old = env.store.create(daily());
  env.store.update(old.id, { since: local(12, 0) - 30 * DAY, checkedAt: local(12, 0) - 8 * DAY });
  const fresh = env.store.create(daily()); // since = now: nothing to catch up
  const justMissed = env.store.create(daily('11:59')); // due 1 minute before the start: still a catch-up
  env.store.update(justMissed.id, { since: local(11, 0) });
  env.runner.start();
  await env.clock.advance(10);
  assert.equal(env.launched.filter(id => id === task.id).length, 1);
  assert.equal(env.store.get(task.id).runs[0].catchUp, true);
  assert.equal(env.launched.filter(id => id === old.id).length, 1); // its latest missed run (today 08:05) is recent
  assert.equal(env.launched.filter(id => id === fresh.id).length, 0);
  assert.equal(env.store.get(justMissed.id).runs[0].catchUp, true);
});

test('a run missed more than 7 days ago is not caught up', async () => {
  const env = setup({ start: local(12, 0) });
  const missed = new Date(local(12, 0) - 9 * DAY); // a yearly date, last due 9 days ago
  const task = env.store.create({ ...daily(), schedule: { kind: 'cron', expression: `0 8 ${missed.getDate()} ${missed.getMonth() + 1} *` } });
  env.store.update(task.id, { since: local(12, 0) - 20 * DAY, checkedAt: local(12, 0) - 10 * DAY });
  env.runner.start();
  await env.clock.advance(10);
  assert.equal(env.launched.length, 0);
});

test('overlap: a due run while the previous one goes is recorded as skipped; run now refuses', async () => {
  const env = setup({ start: local(8, 0) });
  const task = env.store.create({ ...daily(), schedule: { kind: 'cron', expression: '*/10 * * * *' } });
  env.runner.start();
  await env.clock.advance(10 * MIN);
  assert.equal(env.launched.length, 1);
  await env.clock.advance(10 * MIN);
  assert.equal(env.launched.length, 1);
  const runs = env.store.get(task.id).runs;
  assert.equal(runs[0].outcome, 'skipped');
  assert.match(runs[0].reason, /הריצה הקודמת/);
  assert.throws(() => env.runner.runNow(env.store.get(task.id)), error => error.status === 409);
});

test('paused and manual tasks never fire by time; run now still works', async () => {
  const env = setup({ start: local(8, 0) });
  const paused = env.store.create({ ...daily(), active: false });
  env.store.create({ ...daily(), schedule: { kind: 'manual' } });
  env.runner.start();
  assert.equal(env.clock.pending(), 0); // nothing scheduled: no timer at all
  await env.clock.advance(DAY);
  assert.equal(env.launched.length, 0);
  env.runner.runNow(env.store.get(paused.id));
  await env.clock.advance(10);
  assert.deepEqual(env.launched, [paused.id]);
  assert.equal(env.store.get(paused.id).runs[0].manual, true);
});

test('waiting for approval: marked waiting, then stopped and recorded as no approval', async () => {
  const env = setup({ start: local(8, 0), approvalMs: 5 * MIN });
  const task = env.store.create(daily());
  env.runner.start();
  await env.clock.advance(5 * MIN);
  env.sessions.get('s1').pending = 1;
  await env.clock.advance(2000);
  assert.equal(env.store.get(task.id).runs[0].outcome, 'waiting');
  await env.clock.advance(5 * MIN);
  assert.deepEqual(env.stopped, ['s1']);
  await env.clock.advance(2000);
  assert.equal(env.store.get(task.id).runs[0].outcome, 'no-approval');
});

test('failed and stalled turns keep their reason; a deleted session is an error', async () => {
  const env = setup({ start: local(8, 0) });
  const task = env.store.create(daily());
  env.runner.start();
  await env.clock.advance(5 * MIN);
  await env.clock.advance(11 * MIN); // no CLI event for longer than stallMs
  assert.equal(env.store.get(task.id).runs[0].stalled, true);
  Object.assign(env.sessions.get('s1'), { status: 'idle', outcome: 'error', errorText: 'API Error 500' });
  await env.clock.advance(2000);
  assert.equal(env.store.get(task.id).runs[0].outcome, 'error');
  assert.match(env.store.get(task.id).runs[0].reason, /נתקע.*API Error 500/);
  env.runner.runNow(env.store.get(task.id));
  await env.clock.advance(10);
  env.sessions.delete('s2');
  await env.clock.advance(2000);
  assert.match(env.store.get(task.id).runs[0].reason, /נמחק/);
});

test('delete while running: no more writes, no timer left behind', async () => {
  const env = setup({ start: local(8, 0) });
  const task = env.store.create(daily());
  env.runner.start();
  await env.clock.advance(5 * MIN);
  env.store.remove(task.id);
  env.runner.forget(task.id);
  Object.assign(env.sessions.get('s1'), { status: 'idle' });
  await env.clock.advance(5000);
  assert.equal(env.store.get(task.id), null);
  assert.equal(env.clock.pending(), 0);
});

test('system sleep: the wall clock jumps, the next wake fires the missed run once as a catch-up', async () => {
  const env = setup({ start: local(7, 0) });
  const task = env.store.create({ ...daily(), schedule: { kind: 'cron', expression: '0 * * * *' } });
  env.runner.start();
  env.clock.jump(5 * HOUR + 30 * MIN); // asleep: timers did not fire
  await env.clock.advance(1);
  assert.equal(env.launched.length, 1);
  const run = env.store.get(task.id).runs[0];
  assert.equal(run.catchUp, true);
  assert.equal(run.occurrence, local(12, 0));
});

test('restart: live runs become errors; the store keeps at most 50 runs, newest first', () => {
  const file = path.join(dir, 'restart.json');
  const store = createScheduleStore({ file });
  const task = store.create(daily());
  for (let index = 0; index < MAX_RUNS + 5; index++) store.addRun(task.id, { startedAt: index, outcome: 'done' });
  store.addRun(task.id, { startedAt: 999, outcome: 'running' });
  const again = createScheduleStore({ file });
  assert.equal(again.get(task.id).runs.length, MAX_RUNS);
  assert.equal(again.get(task.id).runs[0].startedAt, 999);
  const runner = createRunner({ store: again, timers: { set: () => 1, clear: () => {} }, launch: async () => 'x', inspect: () => null, stop: async () => {}, settings: () => ({}) });
  runner.start();
  assert.equal(again.get(task.id).runs[0].outcome, 'error');
  fs.writeFileSync(file, '{broken');
  assert.equal(createScheduleStore({ file }).get(task.id).runs.length, MAX_RUNS); // a broken file falls back to its .bak
});
