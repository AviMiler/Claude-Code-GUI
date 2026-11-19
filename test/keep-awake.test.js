const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { createKeepAwake, GRACE_MS, BACKOFF_MS } = require('../lib/keep-awake/keep-awake');
const { createKeepAwakeStore } = require('../lib/keep-awake/keep-awake-store');
const { keepAwakeScript, keepAwakeCommand } = require('../lib/keep-awake/keep-awake-child');

/** Fake clock whose timers fire when advanced, and a fake spawn that records children. */
function setup({ platform = 'win32', enabled = true } = {}) {
  let time = 1000; let seq = 0; const timers = new Map();
  const state = { busy: false, enabled, children: [] };
  const clock = {
    timers: { set: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: time + ms }); return id; }, clear: id => timers.delete(id) },
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); time = Math.max(time, due[1].at); due[1].fn();
      }
      time = end;
    },
  };
  const awake = createKeepAwake({
    platform, timers: clock.timers, now: () => time, isBusy: () => state.busy, isEnabled: () => state.enabled,
    spawnChild() {
      const child = new EventEmitter(); child.stderr = new EventEmitter(); child.killed = false;
      child.kill = () => { child.killed = true; };
      state.children.push(child); return child;
    },
  });
  return { awake, state, clock };
}

test('activates on the first running session and stays through a short gap', () => {
  const { awake, state, clock } = setup();
  state.busy = true; awake.refresh();
  assert.equal(state.children.length, 1);
  assert.equal(awake.state().active, true);
  state.busy = false; awake.refresh(); clock.advance(10000); // between two turns
  state.busy = true; awake.refresh(); clock.advance(GRACE_MS * 2);
  assert.equal(state.children.length, 1, 'no second spawn');
  assert.equal(state.children[0].killed, false);
});

test('releases about 30 seconds after the last one ends', () => {
  const { awake, state, clock } = setup();
  state.busy = true; awake.refresh();
  state.busy = false; awake.refresh();
  clock.advance(GRACE_MS - 1); assert.equal(awake.state().active, true);
  clock.advance(1); assert.equal(awake.state().active, false);
  assert.equal(state.children[0].killed, true);
});

test('a session deleted while running (no status event) is noticed by the poll', () => {
  const { awake, state, clock } = setup();
  state.busy = true; awake.refresh();
  state.busy = false; clock.advance(GRACE_MS + 20000);
  assert.equal(awake.state().active, false);
});

test('a disabled switch never spawns; turning it off kills at once', () => {
  const off = setup({ enabled: false });
  off.state.busy = true; off.awake.refresh();
  assert.equal(off.state.children.length, 0);
  const { awake, state } = setup();
  state.busy = true; awake.refresh();
  state.enabled = false; awake.refresh();
  assert.equal(state.children[0].killed, true);
  assert.equal(awake.state().active, false);
});

test('a child that exits early makes it unavailable with the reason, and no retry loop', () => {
  const { awake, state, clock } = setup();
  state.busy = true; awake.refresh();
  state.children[0].stderr.emit('data', 'Add-Type : Cannot add type\n  blocked by policy  ');
  state.children[0].emit('exit', 1);
  assert.deepEqual(awake.state(), { enabled: true, active: false, available: false, reason: 'Add-Type : Cannot add type blocked by policy' });
  awake.refresh(); clock.advance(BACKOFF_MS - 1000); awake.refresh();
  assert.equal(state.children.length, 1, 'no retry inside the back-off');
});

test('after the back-off the next activation tries once more', () => {
  const { awake, state, clock } = setup();
  state.busy = true; awake.refresh();
  state.children[0].emit('exit', 1);
  clock.advance(BACKOFF_MS + 1); awake.refresh();
  assert.equal(state.children.length, 2);
  assert.equal(awake.state().available, true);
  state.children[1].emit('exit', 1);
  assert.equal(awake.state().available, false);
  awake.refresh(); assert.equal(state.children.length, 2);
});

test('a spawn error is a reason too; other platforms are a no-op', () => {
  const { awake, state } = setup();
  state.busy = true; awake.refresh();
  state.children[0].emit('error', new Error('spawn powershell.exe ENOENT'));
  assert.match(awake.state().reason, /ENOENT/);
  const linux = setup({ platform: 'linux' });
  linux.state.busy = true; linux.awake.refresh();
  assert.equal(linux.state.children.length, 0);
  assert.equal(linux.awake.state().available, false);
});

test('stop kills the child', () => {
  const { awake, state } = setup();
  state.busy = true; awake.refresh(); awake.stop();
  assert.equal(state.children[0].killed, true);
});

test('the command polls the pid, uses the execution state without the display flag, and is encoded', () => {
  const script = keepAwakeScript(4321);
  assert.match(script, /Get-Process -Id 4321/);
  assert.match(script, /2147483649/);
  assert.doesNotMatch(script, /2147483651|ES_DISPLAY/);
  const { file, args } = keepAwakeCommand(4321);
  assert.equal(file, 'powershell.exe');
  assert.deepEqual(args.slice(0, 5), ['-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-EncodedCommand']);
  assert.equal(Buffer.from(args[5], 'base64').toString('utf16le'), script);
  assert.throws(() => keepAwakeScript('1; calc'));
});

test('the store: default, saved value, corrupt file falls back to the default', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ka-'));
  const file = path.join(dir, 'keep-awake.json');
  const quiet = console.error; console.error = () => {};
  try {
    assert.equal(createKeepAwakeStore({ file, defaultEnabled: true }).get(), true);
    createKeepAwakeStore({ file, defaultEnabled: true }).set(false);
    assert.equal(createKeepAwakeStore({ file, defaultEnabled: true }).get(), false);
    fs.rmSync(file + '.bak', { force: true });
    fs.writeFileSync(file, '{not json');
    assert.equal(createKeepAwakeStore({ file, defaultEnabled: true }).get(), true);
    fs.writeFileSync(file, '{"enabled":"yes"}');
    assert.equal(createKeepAwakeStore({ file, defaultEnabled: false }).get(), false);
  } finally { console.error = quiet; fs.rmSync(dir, { recursive: true, force: true }); }
});
