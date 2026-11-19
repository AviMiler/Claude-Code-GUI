/**
 * The preview pane's dev-server section: the configurations of the session folder's `.claude/launch.json`, a "הפעלה"
 * button each (a confirmation shows the exact command first; nothing ever starts on its own), a stop button, the status
 * and the last log lines (textContent only). Polls the server while a dev server of the session is active and the pane
 * shows. When a server this tab started answers on its port, `onReady` points the preview at it.
 */
import { h } from '../dom.js';
import { api } from '../api.js';
import { toast } from '../ui.js';
import { confirmLaunch, formatCommand } from './launch-confirm.js';

const POLL_MS = 1000;
const RELOAD_MS = 4000; // a render of the pane reloads the list at most this often
const ACTIVE = ['starting', 'running', 'stopping'];
const STATUS = { starting: 'מתחיל…', running: 'רץ', stopping: 'נעצר…', stopped: 'נעצר', exited: 'הסתיים', failed: 'נכשל' };

/** @param {{onReady:(url:string)=>void}} deps @returns {{node:HTMLElement, show:(sessionId:string)=>void}} */
export function createLaunchList({ onReady }) {
  let sessionId = null;
  let data = null;
  let timer = null;
  const pending = new Set(); // names whose start or stop request is on its way
  const startedHere = new Set(); // `${sessionId}|${name}|${startedAt}` of servers this tab started and not yet shown
  const openLogs = new Set();
  const scrolls = new Map(); // log name -> scrollTop, for a log scrolled away from its end
  let loadedAt = 0;
  const list = h('div', { class: 'launch-items' });
  const node = h('details', { class: 'launch-list', open: true }, h('summary', null, 'שרתי פיתוח ', h('code', { dir: 'ltr' }, '.claude/launch.json')), list);

  async function load() {
    const id = sessionId;
    loadedAt = Date.now();
    try {
      const next = await api.devServers.list(id);
      if (id !== sessionId) return;
      data = next;
    } catch (error) { if (id === sessionId) data = { error: error.message, configurations: [], servers: [], exists: true }; }
    draw();
    noticeReady();
    schedule();
  }

  /** Polls while a dev server of the session is active (live log, status, ready); only while the pane shows. */
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!data?.servers?.some(server => ACTIVE.includes(server.status))) return;
    timer = setTimeout(() => { if (node.isConnected && node.offsetParent) load(); else schedule(); }, POLL_MS);
  }

  function noticeReady() {
    for (const server of data?.servers || []) {
      const key = [...startedHere].find(item => item.startsWith(`${sessionId}|${server.name}|`));
      if (!key) continue;
      if (server.ready && server.url) { startedHere.delete(key); onReady(server.url); } else if (!ACTIVE.includes(server.status)) startedHere.delete(key);
    }
  }

  async function start(entry) {
    if (!await confirmLaunch(entry)) return;
    pending.add(entry.name);
    draw();
    try {
      const { server } = await api.devServers.start(sessionId, entry.name, entry.hash);
      startedHere.add(`${sessionId}|${entry.name}|${server.startedAt}`);
    } catch (error) { toast(error.message, 'error'); }
    pending.delete(entry.name);
    load();
  }

  async function stop(name) {
    pending.add(name);
    draw();
    try { await api.devServers.stop(sessionId, name); } catch (error) { toast(error.message, 'error'); }
    pending.delete(name);
    load();
  }

  function logView(server) {
    const key = server.name;
    const pre = h('pre', { class: 'launch-log', dir: 'ltr', dataset: { name: key } });
    pre.textContent = server.log.map(line => line.text).join('\n') || '(אין פלט עדיין)';
    const details = h('details', { class: 'launch-log-box', open: openLogs.has(key),
      onToggle: event => (event.target.open ? openLogs.add(key) : openLogs.delete(key)) },
    h('summary', null, `יומן (${server.log.length} שורות)`), pre);
    const kept = scrolls.get(key); // a reader who scrolled up keeps the place; otherwise the newest line shows
    requestAnimationFrame(() => { pre.scrollTop = kept === undefined ? pre.scrollHeight : kept; });
    return details;
  }

  function item(entry, server) {
    const busy = pending.has(entry.name);
    const running = server && ACTIVE.includes(server.status);
    const status = server ? `${STATUS[server.status] || server.status}${server.ready ? ' · עונה' : ''}` : '';
    return h('div', { class: 'launch-item' },
      h('div', { class: 'launch-head' },
        h('strong', { class: 'launch-name', dir: 'auto' }, entry.name),
        status && h('span', { class: `launch-status ${server.status}` }, status),
        h('span', { class: 'launch-spacer' }),
        server?.ready && server.url && h('button', { type: 'button', class: 'btn small ghost', onClick: () => onReady(server.url) }, 'הצג'),
        running ? h('button', { type: 'button', class: 'btn small', disabled: busy, onClick: () => stop(entry.name) }, 'עצירה')
          : entry.executable && h('button', { type: 'button', class: 'btn small primary', disabled: busy, onClick: () => start(entry) }, 'הפעלה')),
      entry.executable && h('code', { class: 'launch-command', dir: 'ltr', title: entry.cwd }, formatCommand(entry.program, entry.args)),
      server?.error && h('div', { class: 'editor-note error', role: 'alert' }, server.error),
      server && logView(server));
  }

  function draw() {
    const servers = data?.servers || [];
    node.hidden = !data || (!data.exists && !servers.length);
    if (node.hidden) return list.replaceChildren();
    const names = new Set((data.configurations || []).map(entry => entry.name));
    scrolls.clear();
    for (const pre of list.querySelectorAll('pre.launch-log')) {
      if (pre.scrollHeight - pre.scrollTop - pre.clientHeight > 8) scrolls.set(pre.dataset.name, pre.scrollTop);
    }
    const orphans = servers.filter(server => !names.has(server.name)).map(server => ({ name: server.name })); // removed from the file meanwhile
    list.replaceChildren(...[
      data.error && h('div', { class: 'editor-note error', role: 'alert' }, data.error),
      ...data.configurations.map(entry => item(entry, servers.find(server => server.name === entry.name))),
      ...orphans.map(entry => item(entry, servers.find(server => server.name === entry.name))),
      !data.error && !data.configurations.length && h('p', { class: 'detail-muted' }, 'אין הגדרות בקובץ.'),
    ].filter(Boolean));
  }

  return {
    node,
    /** Shows the section for this session (reloads when it changed). @param {string} id */
    show(id) {
      if (id === sessionId) { if (!timer && Date.now() - loadedAt > RELOAD_MS) load(); return; } // picks up an edited launch.json
      sessionId = id;
      data = null;
      openLogs.clear();
      clearTimeout(timer);
      timer = null;
      draw();
      load();
    },
  };
}
