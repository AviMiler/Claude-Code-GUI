/**
 * Keeps a GUI session and its CLI conversation (<config>/projects/<folder>/<id>.jsonl) the same, the CLI being the
 * source of truth (DECISIONS.md, 2026-10-29): a name a person gives goes into the CLI conversation, so
 * `claude --resume` lists it under that name; the CLI's own title and what a terminal added to the conversation come back.
 */
const path = require('path');
const store = require('./session-store');
const runtime = require('./session-runtime');
const transcripts = require('./transcripts');
const { ENTRYPOINT } = require('./session-env');
const { UNSUPPORTED_REQUEST, publish, pushItem } = require('./session-common');

// Config of the last request; a turn's end and a reported id carry none.
let lastConfig = null;
const remember = config => { if (config) lastConfig = config; return lastConfig; };

/** Sessions saved before names were synced have no `named`: a name other than the folder's was given by a person. */
const isNamed = session => session.named ?? session.name !== path.basename(session.worktree?.source || session.cwd);

/** The CLI conversation the session is on; null when there is none yet, or a fork whose own id is not reported yet. */
const conversationOf = session => (session.claudeSessionId && !session.forkPending ? session.claudeSessionId : null);

/**
 * Gives the CLI conversation the session's name: through the running process (`rename_session`, what the Agent SDK's
 * renameSession sends), else by appending the line the CLI's /rename writes. A conversation the CLI has not started
 * yet gets it when its id is reported (session-events.js).
 */
async function pushName(id, config) {
  const session = store.get(id);
  const conversation = session && conversationOf(session);
  if (!conversation || !isNamed(session) || session.name === session.cliName) return;
  const { name, cwd } = session;
  let done = await (runtime.requestIfLive(id, 'rename_session', { title: name, source: 'host' }) || Promise.reject(new Error('not running')))
    .then(() => true, error => {
      if (!UNSUPPORTED_REQUEST.test(error.message) && error.message !== 'not running') console.error('[cli-sync] rename_session failed:', error.message);
      return false;
    });
  try {
    if (!done) done = transcripts.appendTitle(remember(config), { cwd, id: conversation, title: name });
  } catch (error) {
    console.error('[cli-sync] cannot name the CLI conversation:', error.message);
  }
  if (done && store.get(id)) store.update(id, { cliName: name });
}

/**
 * Takes what the CLI has and the GUI does not: a name given in a terminal (/rename, the picker's Ctrl+R), the CLI's
 * own title for a session nobody named, and answers a terminal added to the conversation (`claude --resume`).
 * The CLI's file is read again only when it changed since the last look.
 */
function pullFromCli(id, config) {
  const session = store.get(id);
  const conversation = session && conversationOf(session);
  if (!conversation || session.status === 'running' || !remember(config)) return;
  let titles;
  try {
    titles = transcripts.readTitles(lastConfig, { cwd: session.cwd, id: conversation });
  } catch (error) {
    return console.error('[cli-sync] cannot read the CLI conversation:', error.message);
  }
  const seen = titles && `${conversation}:${titles.mtimeMs}`;
  if (!titles || seen === session.cliSeen) return;
  const patch = { cliSeen: seen, named: isNamed(session) };
  if (titles.custom && titles.custom !== session.cliName) Object.assign(patch, { name: titles.custom, cliName: titles.custom, named: true });
  else if (!patch.named && titles.auto && titles.auto !== session.name) patch.name = titles.auto;

  // Not after a rewind not answered yet: the answers it cut are still in the file, after the point it went back to.
  const added = !session.resumeAt && session.lastAssistantSession === conversation
    && transcripts.itemsAfter(lastConfig, { cwd: session.cwd, id: conversation, afterUuid: session.lastAssistantUuid, ownEntrypoint: ENTRYPOINT });
  if (added) patch.lastAssistantUuid = added.lastAssistantUuid;
  // A process kept open holds the conversation as it was: the next message starts a new one with --resume, from the file.
  if (added?.foreign || patch.cliName) runtime.close(id);
  publish(store.update(id, patch));
  if (added?.foreign) [{ kind: 'divider', text: 'המשך השיחה מחוץ ל-GUI (טרמינל)' }, ...added.items].forEach(item => pushItem(id, item));
  if (patch.named && store.get(id).name !== store.get(id).cliName) pushName(id, lastConfig);
}

/** Every session not running, when the browser loads the list. */
function pullAll(sessions, config) {
  remember(config);
  for (const session of sessions) pullFromCli(session.id, config);
}

module.exports = { pushName, pullFromCli, pullAll, remember };
