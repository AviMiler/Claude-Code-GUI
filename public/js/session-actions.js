/** Actions on a whole session: create it from the draft, clear, fork, rename, pin, archive, delete, export, copy, add a folder. */
import { api } from './api.js';
import { copyText, downloadText, folderName } from './dom.js';
import { state, activeSession, rememberFolder } from './state.js';
import { exportMarkdown } from './render-items.js';
import { toast, ask } from './ui.js';
import { worktreeChoice } from './worktree/worktree-toggle.js';
import { confirmWorktreeRemoval, reportWorktreeRemoval } from './worktree/worktree-delete.js';
import { projectFolder } from './worktree/project-folder.js';

/**
 * @param {{selectSession:(id:string|null)=>void, openInSplit:(id:string)=>void}} view
 * @param {(error:Error)=>void} report shows an error as a toast
 * @returns {{createFromDraft:(firstText:string, attachments?:object[])=>Promise<object>, actions:object}} actions: spread
 *   into actions.js's object
 */
export function createSessionActions(view, report) {
  /** Creates a session from the draft settings (folder, mode, model, worktree switch) for a first message. */
  async function createFromDraft(firstText, attachments = []) {
    const draft = state.draft;
    const cwd = draft.cwd || state.config.defaultCwd;
    const name = firstText && !firstText.startsWith('/') ? firstText.replace(/\s+/g, ' ').slice(0, 48)
      : attachments.length ? attachments[0].name : folderName(cwd);
    const worktree = await worktreeChoice(cwd);
    if (worktree) toast('יוצר worktree…');
    const session = await api.createSession({ name, cwd, mode: draft.mode, model: draft.model, effort: draft.effort, worktree });
    if (session.notice) toast(session.notice);
    rememberFolder(projectFolder(session));
    state.sessions.set(session.id, session);
    view.selectSession(session.id);
    return session;
  }

  const actions = {
    async clear() {
      const session = activeSession();
      if (!session) return;
      await api.clear(session.id);
      state.context.delete(session.id);
      toast('שיחה חדשה התחילה. הקודמת זמינה ב"שיחות קודמות".');
    },
    async fork(id = state.activeId) {
      const session = state.sessions.get(id);
      if (!session) return;
      const fork = await api.fork(session.id).catch(report);
      if (!fork) return;
      state.sessions.set(fork.id, fork);
      view.selectSession(fork.id);
      toast('נוצר ענף חדש של השיחה');
    },
    /** @param {string|null} [name] asked for when missing @param {string} [id] the open session by default (a row menu passes its own) */
    async rename(name, id = state.activeId) {
      const session = state.sessions.get(id);
      if (!session) return;
      const newName = name || await ask({ title: 'שינוי שם', value: session.name, confirmLabel: 'שמירה' });
      if (newName) await api.updateSession(session.id, { name: newName });
    },
    /** Pins a session to the top of the sidebar (or unpins it). */
    setPinned(id, pinned) {
      api.updateSession(id, { pinned }).catch(report);
    },
    /** Deletes a session (the open one by default); one in a worktree is also asked about its worktree folder. */
    async remove(id = state.activeId) {
      const session = state.sessions.get(id);
      if (!session || !await ask({ title: `למחוק את "${session.name}"?`, text: 'השיחה תימחק מהממשק. ב-Claude Code היא נשארת וניתן לפתוח אותה שוב מ"שיחות קודמות".', confirmLabel: 'מחיקה', danger: true })) return;
      const removeWorktree = await confirmWorktreeRemoval(session);
      const result = await api.deleteSession(session.id, { removeWorktree }).catch(report);
      if (removeWorktree && result) reportWorktreeRemoval(session, result);
    },
    /** Archives a session (the open one by default); asks first only when it would stop running background tasks. */
    async archive(id = state.activeId) {
      const session = state.sessions.get(id);
      if (!session || session.archived) return;
      const tasks = (session.tasks || []).filter(task => task.status === 'running').length;
      if (tasks && !await ask({ title: `להעביר את "${session.name}" לארכיון?`, text: `${tasks} משימות רקע רצות בסשן, והן ייעצרו.`, confirmLabel: 'העברה לארכיון', danger: true })) return;
      const result = await api.archive(id).catch(report);
      if (!result) return;
      if (id === state.activeId) view.selectSession(null);
      state.unread.delete(id);
      toast(result.worktreeError ? `הסשן הועבר לארכיון. ה-worktree נשאר: ${result.worktreeError}` : 'הסשן הועבר לארכיון');
    },
    /** Shows a session in the split pane (a sidebar row's menu). */
    openInSplit: id => view.openInSplit(id),
    /** Brings an archived session back to the list (its worktree is checked out again). */
    async unarchive(id = state.activeId) {
      if (id && await api.unarchive(id).catch(report)) toast('הסשן הוחזר מהארכיון');
    },
    exportChat(name) {
      const session = activeSession();
      if (!session) return;
      downloadText(`${(name || session.name).replace(/[\\/:*?"<>|]+/g, '_')}.md`, exportMarkdown(session));
    },
    async copyLast(n) {
      const texts = (activeSession()?.items || []).filter(item => item.kind === 'text' && !item.parent);
      const item = texts[texts.length - n];
      if (!item) return toast('אין תשובה להעתקה');
      await copyText(item.text);
      return toast('התשובה הועתקה');
    },
    async addDir(dir) {
      const session = activeSession();
      if (!session) return toast('פתח סשן קודם', 'error');
      await api.updateSession(session.id, { addDirs: [...(session.addDirs || []), dir] });
      return toast(`נוספה התיקייה ${dir}`);
    },
  };
  return { createFromDraft, actions };
}
