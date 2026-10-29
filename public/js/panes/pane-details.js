/**
 * Session details rail (Claude Code Desktop): cards for where the session runs (Environment), what it changed
 * (Changes), what runs in the background (Tasks) and how full the context is (Context).
 */
import { api } from '../api.js';
import { h, folderName, copyText } from '../dom.js';
import { icon } from '../icons.js';
import { state } from '../state.js';
import { MODES } from '../modes.js';
import { toast } from '../ui.js';
import { renderContextUsage } from '../panels/panel-usage.js';
import { createSessionFetch } from './session-fetch.js';
import { projectFolder } from '../worktree/project-folder.js';

// The git summary of the shown session, fetched again when a turn starts or ends, or another session is shown.
const summaries = createSessionFetch(id => api.gitSummary(id), error => ({ isRepo: false, error: error.message }));

/** A card: a header row (title, value, chevron when it opens something) and optional content. */
function card({ title, iconName, value, onClick, tooltip }, ...content) {
  const head = h(onClick ? 'button' : 'div', { type: onClick ? 'button' : null, class: 'detail-card-head', title: tooltip || null, onClick },
    icon(iconName), h('span', { class: 'detail-card-title' }, title), h('span', { class: 'detail-card-value' }, value ?? ''),
    onClick ? icon('chevron-down', 'detail-card-go') : null);
  return h('div', { class: 'detail-card' }, head, ...content);
}

/** No git view: a plain folder, or an archived session's worktree that archiving removed (back on restore). */
export const notRepoText = data => (!data.folderMissing ? 'התיקייה אינה מאגר git.'
  : data.archived ? 'תיקיית הסשן לא קיימת כרגע: ה-worktree הוסר בהעברה לארכיון ויחזור בשחזור.' : 'תיקיית הסשן לא קיימת.');

const branchName = branch => String(branch || '').split('...')[0].replace(/^No commits yet on /, '');

function environmentCard(session, summary, modelLabel) {
  const mode = MODES.find(item => item.value === session.mode);
  const row = (label, value, title) => h('div', { class: 'detail-row' }, h('span', null, label), h('span', { dir: 'auto', title: title || null }, value));
  const copyLink = path => h('button', { type: 'button', class: 'link-value', title: `${path}\n(לחיצה מעתיקה)`,
    onClick: async () => { await copyText(path); toast('הנתיב הועתק'); } }, folderName(path));
  return card({ title: 'סביבה', iconName: 'monitor', value: 'מקומי' },
    row('תיקייה', copyLink(projectFolder(session))),
    session.worktree ? row('worktree', copyLink(session.worktree.path)) : null, // the session runs there (worktree/)
    summary?.isRepo ? row('ענף', branchName(summary.branch), summary.branch) : null,
    (session.addDirs || []).length ? row('תיקיות נוספות', String(session.addDirs.length), session.addDirs.join('\n')) : null,
    row('מודל', modelLabel(session)),
    session.fallbackModel ? row('מודל גיבוי', session.fallbackModel) : null,
    row('הרשאות', mode?.label || session.mode));
}

function changesCard(summary, openPane, onRefresh) {
  const refresh = h('button', { type: 'button', class: 'icon-button detail-refresh', title: 'רענון', onClick: onRefresh }, icon('refresh'));
  if (!summary) return card({ title: 'שינויים', iconName: 'diff', value: '…' });
  if (!summary.isRepo) return card({ title: 'שינויים', iconName: 'diff', value: '' }, h('p', { class: 'detail-muted' }, notRepoText(summary)), refresh);
  const value = h('span', { class: 'detail-counts', dir: 'ltr' }, h('span', { class: 'added' }, `+${summary.added}`), h('span', { class: 'removed' }, `−${summary.removed}`));
  const files = summary.files ? `${summary.files} קבצים${summary.untracked ? ` · ${summary.untracked} חדשים` : ''}` : 'אין שינויים שלא נשמרו';
  return card({ title: 'שינויים', iconName: 'diff', value, onClick: () => openPane('changes'),
    tooltip: 'שינויים בתיקייה שעוד לא נשמרו ב-commit (גם כאלה שלא נעשו בסשן הזה). לחיצה פותחת את חלונית השינויים.' },
  h('div', { class: 'detail-row detail-muted' }, h('span', null, files), refresh));
}

function tasksCard(session, openPane) {
  const running = (session.tasks || []).filter(task => task.status === 'running');
  return card({ title: 'משימות רקע', iconName: 'list', value: running.length ? String(running.length) : '', onClick: () => openPane('tasks') },
    running.length ? h('ul', { class: 'detail-list' }, running.slice(0, 5).map(task => h('li', { dir: 'auto' }, icon('loader', 'spinning'), task.description || task.id)))
      : h('p', { class: 'detail-muted' }, 'אין משימות שרצות עכשיו.'));
}

/**
 * @param {{openPane:(id:string)=>void, modelLabel:(session:object)=>string, rerender:()=>void}} deps
 *   openPane: another pane (changes, tasks); rerender: draws the panes again once a fetch is back
 * @returns {import('./pane-host.js').PaneDefinition}
 */
export function createDetailsPane({ openPane, modelLabel, rerender }) {
  let contextOpen = false;
  let contextBox = null;
  let contextFor = null;

  function loadContext(session) {
    contextFor = session.id;
    contextBox = h('div', { class: 'detail-context' }, h('p', { class: 'detail-muted' }, 'טוען…'));
    // ifRunning: looking at the rail must never start a Claude Code process.
    api.control({ sessionId: session.id }, 'get_context_usage', { ifRunning: true }).then(usage => {
      contextBox.replaceChildren(...(usage ? renderContextUsage(usage) : [h('p', { class: 'detail-muted' }, 'זמין כש-Claude Code של הסשן פעיל.')]));
    }).catch(error => contextBox.replaceChildren(h('p', { class: 'detail-muted' }, error.message)));
  }

  function contextCard(session) {
    const percent = state.context.get(session.id);
    if (contextOpen && contextFor !== session.id) loadContext(session);
    const toggle = () => { contextOpen = !contextOpen; if (contextOpen) loadContext(session); rerender(); };
    return card({ title: 'הקשר', iconName: 'gauge', value: percent >= 0 ? `${percent}%` : '', onClick: toggle },
      contextOpen ? contextBox : null);
  }

  return {
    id: 'details', title: 'פרטי סשן', icon: 'panel-right',
    render(body, session) {
      const summary = summaries.get(session, rerender);
      body.replaceChildren(h('div', { class: 'detail-cards' },
        environmentCard(session, summary, modelLabel),
        changesCard(summary, openPane, () => summaries.get(session, rerender, true)),
        tasksCard(session, openPane),
        contextCard(session)));
    },
  };
}
