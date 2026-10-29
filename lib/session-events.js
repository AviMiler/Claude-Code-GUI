/** What the live CLI reports (runtime.init callbacks), applied to the session store and broadcast to the browsers. */
const store = require('./session-store');
const runtime = require('./session-runtime');
const { broadcast } = require('./event-hub');
const { describeFailure } = require('./failure-messages');
const tasks = require('./task-tracker');
const { VALID_MODES, publish, pushItem, pushExtra, setStatus } = require('./session-common');
const messages = require('./session-messages');
const cliSync = require('./session-cli-sync');

/** Items of these events are lines of the CLI's conversation file too; the others exist only in the stream. */
const inTranscript = event => event.type === 'assistant' || event.type === 'user'
  || (event.type === 'system' && ['compact_boundary', 'local_command_output'].includes(event.subtype));

runtime.init({
  onItem(id, item, event) {
    if (!store.get(id)) return;
    if (item.kind === 'result' && messages.stopRequested.delete(id) && item.isError) {
      return pushExtra(id, { kind: 'notice', text: 'הריצה הופסקה.', stopped: true });
    }
    (inTranscript(event) ? pushItem : pushExtra)(id, item);
  },
  onDelta: (id, delta) => broadcast({ type: 'delta', sessionId: id, ...delta }),
  onInit: (id, info) => broadcast({ type: 'runtime', sessionId: id, info: { ...info, tools: info.tools.length } }),
  onSessionId(id, claudeSessionId) {
    const session = store.get(id);
    if (session && session.claudeSessionId !== claudeSessionId) {
      // cliName is what this CLI conversation is called: a new one (first message, /clear, fork) has none yet.
      publish(store.update(id, { claudeSessionId, forkPending: false, cliName: null }));
      cliSync.pushName(id); // it gets the name a person gave
    }
  },
  // The CLI replayed a message the GUI sent: it is a point of that CLI conversation, and a rewind's cut (resumeAt) has been applied.
  onUserReplay(id, uuid, claudeSession) {
    const session = store.get(id);
    const item = session?.items.findLast(entry => entry.cliUuid === uuid);
    if (item) { item.cliSession = claudeSession; store.update(id, { resumeAt: null }); }
  },
  onAssistantUuid: (id, uuid, claudeSession) => store.get(id) && store.update(id, { lastAssistantUuid: uuid, lastAssistantSession: claudeSession }),
  // Newest first; a few, because a message the CLI joins with another never becomes a line of its own.
  onLineUuid: (id, uuid) => store.get(id) && store.update(id, { anchors: [uuid, ...(store.get(id).anchors || [])].slice(0, 4) }),
  onTurnEnd(id) {
    setStatus(id, 'idle');
    cliSync.refresh(id); // the conversation as the CLI wrote it (or at the next look, if it is still writing)
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
    if (messages.stopRequested.delete(id)) pushExtra(id, { kind: 'notice', text: 'הריצה הופסקה.', stopped: true });
    else if (!info.killed) pushExtra(id, { kind: 'error', text: describeFailure(info) });
    setStatus(id, 'idle');
  },
});
