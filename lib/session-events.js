/** What the live CLI reports (runtime.init callbacks), applied to the session store and broadcast to the browsers. */
const store = require('./session-store');
const runtime = require('./session-runtime');
const { broadcast } = require('./event-hub');
const { describeFailure } = require('./failure-messages');
const tasks = require('./task-tracker');
const { VALID_MODES, publish, pushItem, setStatus } = require('./session-common');
const messages = require('./session-messages');

runtime.init({
  onItem(id, item) {
    if (!store.get(id)) return;
    if (item.kind === 'result') {
      store.update(id, { costUsd: (store.get(id).costUsd || 0) + (item.costUsd || 0) });
      publish(store.get(id));
      if (messages.stopRequested.delete(id) && item.isError) return pushItem(id, { kind: 'notice', text: 'הריצה הופסקה.', stopped: true });
    }
    pushItem(id, item);
  },
  onDelta: (id, delta) => broadcast({ type: 'delta', sessionId: id, ...delta }),
  onInit: (id, info) => broadcast({ type: 'runtime', sessionId: id, info: { ...info, tools: info.tools.length } }),
  onSessionId(id, claudeSessionId) {
    const session = store.get(id);
    if (session && session.claudeSessionId !== claudeSessionId) {
      publish(store.update(id, { claudeSessionId, forkPending: false }));
    }
  },
  onTurnEnd(id) {
    setStatus(id, 'idle');
    setImmediate(() => messages.dispatchNext(id)); // after the result is out, like pressing Enter again
  },
  // A late correction's turn arrived after the hold gave up (runtime-corrections.js): working again.
  onTurnResume: id => setStatus(id, 'running'),
  onTask(id, update) {
    if (store.get(id)) broadcast({ type: 'tasks', sessionId: id, tasks: tasks.apply(id, update) });
  },
  onPermission: (id, prompt) => broadcast({ type: 'permission', sessionId: id, prompt }),
  onPermissionResolved: (id, requestId) => broadcast({ type: 'permission-resolved', sessionId: id, requestId }),
  onModeChange(id, mode) {
    const session = store.get(id);
    const normalized = mode === 'manual' ? 'default' : mode;
    if (session && VALID_MODES.includes(normalized) && session.mode !== normalized) {
      publish(store.update(id, { mode: normalized }));
    }
  },
  onExit(id, info) {
    if (!store.get(id)) return;
    if (tasks.endAll(id)) broadcast({ type: 'tasks', sessionId: id, tasks: tasks.list(id) });
    // A process that exits between turns (idle timeout, restart) is not news.
    if (!info.duringTurn && !info.spawnError) return;
    if (messages.stopRequested.delete(id)) pushItem(id, { kind: 'notice', text: 'הריצה הופסקה.', stopped: true });
    else if (!info.killed) pushItem(id, { kind: 'error', text: describeFailure(info) });
    setStatus(id, 'idle');
  },
});
