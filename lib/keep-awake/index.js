/**
 * The real keep-awake of this server: the data-folder switch (keep-awake-store.js), the PowerShell child
 * (keep-awake-child.js) and the busy check over the stored sessions. `refresh` is cheap and safe to call before `start`.
 * Killed on server exit and on SIGINT / SIGTERM / SIGHUP (like terminal/shell-runs.js); the child also polls our pid.
 */
const path = require('path');
const { spawn } = require('child_process');
const store = require('../session-store');
const { createKeepAwake } = require('./keep-awake');
const { createKeepAwakeStore } = require('./keep-awake-store');
const { keepAwakeCommand } = require('./keep-awake-child');

let awake = null; let switchStore = null;

/** @param {{keepAwake?:boolean}} config `keepAwake` (default true) is only the default of the switch */
function start(config) {
  if (awake) return;
  switchStore = createKeepAwakeStore({ file: path.join(store.DATA_DIR, 'keep-awake.json'), defaultEnabled: config.keepAwake !== false });
  awake = createKeepAwake({
    isEnabled: () => switchStore.get(),
    isBusy: () => store.list().some(session => session.status === 'running'),
    spawnChild() {
      const { file, args } = keepAwakeCommand(process.pid);
      return spawn(file, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    },
  });
  process.on('exit', stop);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stop(); process.exit(); });
  awake.refresh();
}

/** Re-evaluates now: call after a session's status changed or a scheduled run started or ended. */
function refresh() { awake?.refresh(); }
/** @returns {{enabled:boolean, active:boolean, available:boolean, reason:string}} */
function state() { return awake ? awake.state() : { enabled: false, active: false, available: false, reason: '' }; }
/** The user's switch (kept in the data folder). @returns {object} the new state */
function setEnabled(enabled) { switchStore?.set(enabled); awake?.refresh(); return state(); }
/** Kills the child (server exit, signals, release). */
function stop() { awake?.stop(); }

module.exports = { start, refresh, state, setEnabled, stop };
