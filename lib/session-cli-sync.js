/**
 * Keeps each GUI session the same as its CLI conversation, the CLI being the source of truth (DECISIONS.md,
 * 2026-10-29). What a session shows is built from the CLI's files (lib/history-build.js) whenever they change, from the
 * GUI's own process or from a terminal (`claude --resume`, /rewind, /compact, /rename): the files are looked at every
 * second and read only when one changed. A name a person gives goes into the CLI conversation; the CLI's own comes back.
 */
const store = require('./session-store');
const runtime = require('./session-runtime');
const transcripts = require('./transcripts');
const { buildItems } = require('./history-build');
const { ENTRYPOINT } = require('./session-env');
const { broadcast } = require('./event-hub');
const { UNSUPPORTED_REQUEST, publish } = require('./session-common');

const POLL_MS = 1000;

/** JSON with sorted keys: an item built from the file and the same one that arrived live compare equal. */
const canonical = value => JSON.stringify(value, (key, inner) => (inner && typeof inner === 'object' && !Array.isArray(inner)
  ? Object.fromEntries(Object.keys(inner).sort().map(name => [name, inner[name]])) : inner));
let config = null; // the server's, from start()

/** The CLI conversation the session is on; null when there is none yet, or a fork whose own id is not reported yet. */
const conversationOf = session => (session.claudeSessionId && !session.forkPending ? session.claudeSessionId : null);

/**
 * Gives the CLI conversation the session's name: through the running process (`rename_session`, what the Agent SDK's
 * renameSession sends), else by appending the line the CLI's /rename writes. A conversation the CLI has not started
 * yet gets it when its id is reported (session-events.js).
 */
async function pushName(id) {
  const session = store.get(id);
  const conversation = session && conversationOf(session);
  if (!conversation || !session.named || session.name === session.cliName || !config) return;
  const { name, cwd } = session;
  const request = runtime.requestIfLive(id, 'rename_session', { title: name, source: 'host' });
  let done = request ? await request.then(() => true, error => {
    if (!UNSUPPORTED_REQUEST.test(error.message)) console.error('[cli-sync] rename_session failed:', error.message);
    return false;
  }) : false;
  try {
    if (!done) done = transcripts.appendTitle(config, { cwd, id: conversation, title: name });
  } catch (error) {
    console.error('[cli-sync] cannot name the CLI conversation:', error.message);
  }
  if (done && store.get(id)) store.update(id, { cliName: name });
}

/** What decides whether the shown history must be built again: the files' change times and the GUI's own parts. */
function stampOf(session) {
  const ids = [...(session.conversations || []), session.claudeSessionId];
  const times = ids.map(id => (id ? transcripts.conversationStamp(config, { cwd: session.cwd, id }) : null));
  return JSON.stringify([ids, times, session.resumeAt || null, (session.extras || []).length, Object.keys(session.sent || {}).length]);
}

/** A name given in a terminal, or the CLI's own title for a session nobody named. */
function namePatch(session, lines) {
  const { custom, auto } = transcripts.titlesOf(lines);
  if (custom && custom !== session.cliName) return { name: custom, cliName: custom, named: true };
  if (!session.named && auto && auto !== session.name) return { name: auto };
  return {};
}

/**
 * Builds the session's history from the CLI files again when they changed, and tells the browsers when it differs.
 * Not while a turn runs: its items arrive live, and the file is read once the turn is over.
 * @param {{force?:boolean}} [options] force: build even when nothing seems changed (a rewind)
 */
function refresh(id, { force = false } = {}) {
  const session = store.get(id);
  if (!session || !config || session.status === 'running') return;
  try {
    const stamp = stampOf(session);
    if (!force && stamp === session.historyStamp) return;
    const read = conversation => transcripts.readConversation(config, { cwd: session.cwd, id: conversation });
    const current = session.claudeSessionId ? read(session.claudeSessionId) : null;
    // An answer the GUI already got that the file does not hold yet: the CLI is still writing, the next look takes it.
    if (current && session.lastAssistantSession === session.claudeSessionId && session.lastAssistantUuid
      && !current.lines.some(line => line.uuid === session.lastAssistantUuid)) return;
    const { items, chains } = buildItems(session, [
      ...(session.conversations || []).map(conversation => ({ id: conversation, lines: read(conversation)?.lines ?? null })),
      { id: session.claudeSessionId, lines: current?.lines ?? null, leaf: session.resumeAt || null, current: true },
    ]);
    const patch = { historyStamp: stamp, items, ...(current && namePatch(session, current.lines)) };
    const chain = chains.at(-1);
    if (chain.length && !session.resumeAt) {
      const answer = chain.findLast(line => line.type === 'assistant');
      patch.anchors = [chain.at(-1).uuid]; // what the GUI adds next comes after the conversation as it is now
      if (answer) Object.assign(patch, { lastAssistantUuid: answer.uuid, lastAssistantSession: session.claudeSessionId });
    }
    // Another program wrote to it (a terminal): a process the GUI keeps open still holds the conversation as it was.
    const message = chain.findLast(line => line.type === 'user' || line.type === 'assistant');
    if ((message && message.entrypoint !== ENTRYPOINT && message.uuid !== session.seenForeign) || patch.cliName) {
      if (message) patch.seenForeign = message.uuid;
      runtime.close(id);
    }
    const changed = canonical(items) !== canonical(session.items);
    const renamed = patch.name !== undefined && patch.name !== session.name;
    store.update(id, patch);
    if (renamed) publish(store.get(id));
    if (changed) broadcast({ type: 'history', sessionId: id, items });
    if (store.get(id).named && store.get(id).name !== store.get(id).cliName) pushName(id);
  } catch (error) {
    console.error('[cli-sync] cannot read the CLI conversation:', error.message);
  }
}

const refreshAll = () => store.list().forEach(session => refresh(session.id));

/** Starts looking at the CLI's files. @param {object} serverConfig */
function start(serverConfig) {
  config = serverConfig;
  refreshAll();
  setInterval(refreshAll, POLL_MS).unref();
}

module.exports = { start, refresh, refreshAll, pushName };
