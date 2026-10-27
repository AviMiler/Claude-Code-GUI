/**
 * The welcome page's "worktree נפרד" switch (Claude Code Desktop): the next session gets its own git worktree and
 * branch, so sessions working in parallel never touch each other's files. The server creates it (lib/git/worktree.js).
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';

const WANT_KEY = 'claude-gui.worktree';
const PROBE_TTL_MS = 30000; // a folder may become a repository (git init) while the page is open
const probes = new Map(); // folder -> { at, result: Promise<{isRepo, hasCommits?, branch?}>, known?: that result once in }
const TITLE = 'הסשן יעבוד בעותק נפרד של המאגר (.claude/worktrees) על ענף חדש משלו, כך שסשנים במקביל לא נוגעים זה בקבצים של זה. '
  + 'מתחיל מה-commit הנוכחי: שינויים שלא נשמרו ב-commit וקבצים ש-git מתעלם מהם לא מועתקים.';

/** Whether the user turned the switch on (remembered in this browser). */
export function worktreeWanted() {
  try { return localStorage.getItem(WANT_KEY) === '1'; } catch { return false; }
}

function setWanted(on) {
  try { localStorage.setItem(WANT_KEY, on ? '1' : '0'); } catch { /* storage may be blocked */ }
}

function probe(folder) {
  const cached = probes.get(folder);
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.result;
  const entry = { at: Date.now(), known: null };
  entry.result = api.probeWorktree(folder).catch(() => ({ isRepo: false })).then(result => { entry.known = result; return result; });
  probes.set(folder, entry);
  return entry.result;
}

/** Without waiting: the switch is on and the folder's last answer said it can (warm-up then skips this folder). */
export function worktreeLikely(folder) {
  const known = probes.get(folder)?.known;
  return worktreeWanted() && Boolean(known?.isRepo && known.hasCommits);
}

/** @returns {Promise<boolean>} the next session in this folder gets a worktree: the switch is on and the folder can */
export async function worktreeChoice(folder) {
  if (!worktreeWanted()) return false;
  const result = await probe(folder);
  return Boolean(result.isRepo && result.hasCommits);
}

/**
 * @param {()=>string} getFolder the folder the welcome page shows now
 * @returns {{node:HTMLElement, update:()=>void}} update: call after the folder changed
 */
export function createWorktreeToggle(getFolder) {
  const input = h('input', { type: 'checkbox' });
  const note = h('span', { class: 'worktree-note', dir: 'auto' });
  const node = h('label', { class: 'worktree-toggle disabled' }, input, icon('branch'), h('span', null, 'worktree נפרד'), note);
  input.disabled = true;
  input.addEventListener('change', () => setWanted(input.checked));
  let shown = null;

  async function update() {
    const folder = getFolder();
    shown = folder;
    const result = await probe(folder);
    if (shown !== folder) return; // the folder changed again meanwhile
    const usable = Boolean(result.isRepo && result.hasCommits);
    input.disabled = !usable;
    input.checked = usable && worktreeWanted();
    node.classList.toggle('disabled', !usable);
    node.title = usable ? TITLE : '';
    note.textContent = !result.isRepo ? 'התיקייה אינה מאגר git' : !result.hasCommits ? 'אין עדיין commit במאגר'
      : `ענף חדש מ-${result.branch || 'HEAD'}`;
  }
  update();
  return { node, update };
}
