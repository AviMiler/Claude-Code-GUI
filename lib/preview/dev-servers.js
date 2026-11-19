/**
 * Dev servers the user started from the preview pane (only on an explicit click after a confirmation; never on its own).
 * One per session + configuration name. Spawned with an argument array (no shell, except the cmd.exe rules of a .cmd/.bat
 * shim on Windows, spawn-utils.js), hidden window, in a folder inside the session folder, with the scrubbed environment
 * of dev-env.js. Killed with its whole process tree on stop, session delete, archive and server exit or signals.
 */
const { spawn } = require('child_process');
const { httpError } = require('../http-utils');
const { needsShell } = require('../spawn-utils');
const { killTree } = require('../terminal/shell-run');
const { portAnswers } = require('./dev-port');
const { devServerEnv } = require('./dev-env');
const { createDevLog } = require('./dev-log');

const READY_POLL_MS = 500;
const READY_TIMEOUT_MS = 120000;
const STOP_GRACE_MS = 3000;
const ACTIVE = ['starting', 'running', 'stopping'];
const servers = new Map(); // sessionId -> Map(name -> record)

const portTaken = port => `הפורט ${port} כבר תפוס במחשב הזה. עצור את מה שרץ עליו או שנה את הפורט ב-launch.json.`;

const SAFE_CMD_ARG = /^[\w\-.:\\/=@,+]+$/;

/**
 * One argument for a program started through cmd.exe. `%`, `"` and control characters were refused before
 * (launch-validate.js, launch-config.js); inside quotes cmd.exe takes & | < > ^ literally. Backslashes before the
 * closing quote are doubled, so the program's parser (MS C runtime) cannot read `\"` as an escaped quote.
 */
const cmdArg = arg => (SAFE_CMD_ARG.test(arg) ? arg : `"${arg.replace(/(\\+)$/, '$1$1')}"`);

/**
 * What to spawn: the resolved full path itself, or (a .cmd / .bat on Windows) through cmd.exe. With a full path cmd.exe
 * does not search for the program, so a file in the project folder cannot take its place.
 * @param {string} program the full path from dev-resolve.js @param {string[]} args
 */
function spawnSpec(program, args) {
  if (!needsShell(program)) return { file: program, args, shell: false };
  if (/["%]/.test(program)) throw new Error('נתיב התוכנה עם " או % לא נתמך דרך cmd.exe');
  if (args.some(arg => /["%]/.test(arg))) throw new Error('ארגומנט עם " או % לא נתמך דרך cmd.exe');
  return { file: `"${program}"`, args: args.map(cmdArg), shell: true };
}

/** @returns {object} what the browser sees of a record (never the environment) */
const view = record => ({
  name: record.name, status: record.status, ready: record.ready, pid: record.pid, port: record.port, url: record.url,
  startedAt: record.startedAt, endedAt: record.endedAt, exitCode: record.exitCode, error: record.error, log: record.log.lines(),
});

function finish(record, exitCode, signal) {
  if (!ACTIVE.includes(record.status)) return;
  record.log.flush();
  record.exitCode = exitCode;
  record.endedAt = Date.now();
  record.ready = false;
  if (record.status === 'stopping') record.status = 'stopped';
  else record.status = exitCode === 0 ? 'exited' : 'failed';
  if (record.status === 'failed' && !record.error) record.error = `השרת נעצר (קוד יציאה ${exitCode ?? signal ?? 'לא ידוע'})`;
  record.log.note(`— השרת נעצר${exitCode !== null && exitCode !== undefined ? ` (קוד ${exitCode})` : ''} —`);
}

async function waitReady(record) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (record.status === 'running' && !record.ready) {
    if (await portAnswers(record.port)) { if (record.status === 'running') { record.ready = true; record.log.note(`— הפורט ${record.port} עונה —`); } return; }
    if (Date.now() > deadline) { record.log.note(`— הפורט ${record.port} לא ענה אחרי ${READY_TIMEOUT_MS / 1000} שניות —`); return; }
    await new Promise(resolve => setTimeout(resolve, READY_POLL_MS).unref());
  }
}

/**
 * Starts one validated configuration (launch-config.js). Throws 409 when it already runs or its port is taken.
 * @param {string} sessionId @param {{name:string, program:string, args:string[], cwd:string, port:number|null, url:string|null, env:object}} entry
 * @param {{env?:object}} config @returns {Promise<object>} the record's view
 */
async function startDevServer(sessionId, entry, config) {
  if (!servers.has(sessionId)) servers.set(sessionId, new Map());
  const own = servers.get(sessionId);
  if (ACTIVE.includes(own.get(entry.name)?.status)) throw httpError(409, 'השרת הזה כבר רץ. עצור אותו לפני הפעלה מחדש.');
  const record = { name: entry.name, status: 'starting', ready: false, pid: null, port: entry.port, url: entry.url, child: null,
    startedAt: Date.now(), endedAt: null, exitCode: null, error: null, log: null };
  const { env, secrets } = devServerEnv(config, entry.env);
  record.log = createDevLog(secrets, () => { if (record.port) record.error = portTaken(record.port); });
  own.set(entry.name, record); // taken before the port check, so a second click cannot start it twice
  if (entry.port && await portAnswers(entry.port)) {
    Object.assign(record, { status: 'failed', error: portTaken(entry.port), endedAt: Date.now() });
    throw httpError(409, record.error);
  }
  if (own !== servers.get(sessionId) || own.get(entry.name) !== record || record.status !== 'starting') return view(record); // stopped meanwhile
  try {
    const spec = spawnSpec(entry.program, entry.args);
    record.child = spawn(spec.file, spec.args, { cwd: entry.cwd, env, shell: spec.shell, stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true, detached: process.platform !== 'win32' }); // POSIX: its own group, so the kill reaches its children
  } catch (error) {
    Object.assign(record, { status: 'failed', error: `ההפעלה נכשלה: ${error.message}`, endedAt: Date.now() });
    throw httpError(500, record.error);
  }
  record.pid = record.child.pid ?? null;
  record.status = 'running';
  record.log.note(`— הופעל: ${entry.program} ${entry.args.join(' ')} —`);
  for (const stream of ['stdout', 'stderr']) {
    record.child[stream].setEncoding('utf8');
    record.child[stream].on('data', chunk => record.log.push(stream, chunk));
  }
  record.child.on('error', error => { record.error = `ההפעלה נכשלה: ${error.message}`; finish(record, null, null); });
  record.child.on('close', (code, signal) => finish(record, code, signal));
  if (record.port) waitReady(record);
  return view(record);
}

/** @param {string} sessionId @param {string} name @param {boolean} [sync] wait for the kill (server exit) @returns {boolean} it was running */
function stopDevServer(sessionId, name, sync = false) {
  const record = servers.get(sessionId)?.get(name);
  if (!record || !ACTIVE.includes(record.status)) return false;
  if (record.status === 'starting' && !record.child) { Object.assign(record, { status: 'stopped', endedAt: Date.now() }); return true; }
  record.status = 'stopping';
  record.ready = false;
  if (record.child) killTree(record.child, sync);
  setTimeout(() => finish(record, null, 'SIGKILL'), STOP_GRACE_MS).unref(); // a child that keeps the pipes open
  return true;
}

/** Stops every dev server of a session and forgets them (session delete, archive). @param {boolean} [sync] */
function stopSessionDevServers(sessionId, sync = false) {
  for (const name of [...(servers.get(sessionId)?.keys() || [])]) stopDevServer(sessionId, name, sync);
  servers.delete(sessionId);
}

/** @param {string} sessionId @returns {object[]} the session's dev servers (running and the last finished run of each) */
const listDevServers = sessionId => [...(servers.get(sessionId)?.values() || [])].map(view);

function stopAll() { for (const sessionId of [...servers.keys()]) stopSessionDevServers(sessionId, true); }
process.on('exit', stopAll);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stopAll(); process.exit(); });

module.exports = { startDevServer, stopDevServer, stopSessionDevServers, listDevServers, spawnSpec };
