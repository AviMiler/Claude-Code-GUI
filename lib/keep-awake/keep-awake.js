/**
 * The keep-awake state machine. `refresh()` is called whenever a session's status changes or a scheduled run starts or
 * ends; it asks `isBusy()` (any session running, which includes waiting for an approval or the model gate, and every
 * scheduled run, because a run is a session). Busy: one child process holds the machine awake. Not busy: it is released
 * only after `graceMs`, so the gap between two turns never flaps. A child that exits by itself (Add-Type blocked by
 * Constrained Language Mode, AppLocker, antivirus) makes keep-awake unavailable with its stderr as the reason; it is
 * tried again only on an activation after `backoffMs`. Spawn, timers, clock and platform are injected for tests.
 */
const GRACE_MS = 30000;
const BACKOFF_MS = 10 * 60000;
const POLL_MS = 10000;

/**
 * @param {{spawnChild:()=>object, isBusy:()=>boolean, isEnabled:()=>boolean, platform?:string,
 *   timers?:{set:Function, clear:Function}, now?:()=>number, graceMs?:number, backoffMs?:number}} deps
 *   spawnChild returns a ChildProcess-like: kill(), on('exit'|'error'), stderr with 'data'
 * @returns {{refresh:()=>void, state:()=>{enabled:boolean, active:boolean, available:boolean, reason:string}, stop:()=>void}}
 */
function createKeepAwake({ spawnChild, isBusy, isEnabled, platform = process.platform, timers = { set: setTimeout, clear: clearTimeout }, now = Date.now, graceMs = GRACE_MS, backoffMs = BACKOFF_MS }) {
  let child = null; let releaseTimer = null; let pollTimer = null; let reason = ''; let retryAt = 0;
  const supported = platform === 'win32';
  const wanted = () => isEnabled() && isBusy();

  const cancelRelease = () => { if (releaseTimer) timers.clear(releaseTimer); releaseTimer = null; };
  function kill() {
    if (pollTimer) timers.clear(pollTimer);
    pollTimer = null;
    const old = child; child = null;
    try { old?.kill(); } catch { /* already gone */ }
  }

  /** The child ended without being asked to: no retry loop, the next try is after the back-off. */
  function fail(message) {
    if (pollTimer) timers.clear(pollTimer);
    pollTimer = null;
    child = null;
    reason = message;
    retryAt = now() + backoffMs;
  }

  function start() {
    let stderr = '';
    let started;
    try { started = spawnChild(); } catch (error) { return fail(error.message); }
    child = started;
    pollTimer = timers.set(poll, POLL_MS); // a session deleted while running sends no status event: look again now and then
    started.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    started.on('error', error => { if (child === started) fail(error.message); });
    started.on('exit', code => { if (child === started) fail(stderr.replace(/\s+/g, ' ').trim().slice(0, 300) || `התהליך הסתיים (קוד ${code})`); });
  }

  function poll() { pollTimer = child ? timers.set(poll, POLL_MS) : null; refresh(); }

  function refresh() {
    if (!supported) return;
    if (wanted()) {
      cancelRelease();
      if (!child && (!reason || now() >= retryAt)) { reason = ''; start(); }
    } else if (!isEnabled()) { cancelRelease(); kill(); } // the switch is off: no grace
    else if (child && !releaseTimer) releaseTimer = timers.set(() => { releaseTimer = null; if (!wanted()) kill(); }, graceMs);
  }

  const state = () => ({
    enabled: isEnabled(), active: Boolean(child), available: supported && !reason,
    reason: supported ? reason : 'נתמך רק ב-Windows',
  });

  return { refresh, state, stop: () => { cancelRelease(); kill(); } };
}

module.exports = { createKeepAwake, GRACE_MS, BACKOFF_MS };
