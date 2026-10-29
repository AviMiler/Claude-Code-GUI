/**
 * The warmed spare (session-runtime.js): a CLI process started for a session that does not exist yet, while the user
 * types on the welcome page. Starting the CLI takes seconds; this way the first message of a new session does not wait.
 */
const crypto = require('crypto');

const SPARE_IDLE_MS = 3 * 60000;

/** What must match between a warmed spare and the session created later, for the spare to be used. */
const spareKey = settings => JSON.stringify([settings.cwd, settings.mode, settings.model || '', settings.effort || '']);

/**
 * @param {{runtimes:Map, ensure:Function, live:Function, retire:Function, scheduleIdle:Function}} runtime the runtime's own parts
 * @returns {{prewarmNew:Function, spareFor:Function, adoptSpare:Function, forget:(runtime:object)=>void}}
 */
function createSpare({ runtimes, ensure, live, retire, scheduleIdle }) {
  let spare = null; // { key, runtime }: one at most, closed after a few idle minutes

  /** @param {{cwd:string, mode:string, model?:string, effort?:string}} settings */
  async function prewarmNew(settings, config) {
    const key = spareKey(settings);
    if (spare && spare.key === key && live(spare.runtime.sessionId)) return;
    if (spare) retire(spare.runtime);
    const runtime = await ensure({ id: `spare-${crypto.randomUUID()}`, addDirs: [], ...settings }, config);
    runtime.idleMs = SPARE_IDLE_MS;
    scheduleIdle(runtime);
    spare = { key, runtime };
  }

  /** The warmed spare for a folder, if one is running (its catalog saves starting a probe). */
  const spareFor = cwd => (spare && JSON.parse(spare.key)[0] === cwd && live(spare.runtime.sessionId) ? spare.runtime : null);

  /** Gives the warmed spare to a just-created session when its settings match. @returns {boolean} */
  function adoptSpare(session, config) {
    if (!spare || spare.key !== spareKey(session) || !live(spare.runtime.sessionId)) return false;
    const { runtime } = spare;
    spare = null;
    runtimes.delete(runtime.sessionId);
    runtime.sessionId = session.id;
    runtime.idleMs = (config.idleMinutes || 20) * 60000;
    runtimes.set(session.id, runtime);
    scheduleIdle(runtime);
    return true;
  }

  /** A process exited: if it was the spare, there is none now. */
  const forget = runtime => { if (spare?.runtime === runtime) spare = null; };

  return { prewarmNew, spareFor, adoptSpare, forget };
}

module.exports = { createSpare };
