/** What the user can do to sessions (send, stop, clear, fork, rename, settings...) and the context given to panels. */
import { api } from './api.js';
import { copyText, downloadText, folderName } from './dom.js';
import { state, activeSession, currentScope, scopeFolder, getCatalog, getCommands, forgetCatalog, rememberFolder } from './state.js';
import { availableModes, MODE_CYCLE } from './modes.js';
import { exportMarkdown } from './render-items.js';
import { forServer, fromStored } from './attachments.js';
import { openPanel } from './panels/panel-host.js';
import { toast, ask } from './ui.js';
import { guardedApi, confirmMode, confirmOutwardCommand, isCancelled, CANCELLED_MESSAGE } from './risk.js';

/**
 * @param {{refresh:()=>void, selectSession:(id:string|null)=>void, insert:(text:string, options?:object)=>void,
 *   restore:(entries:{text:string, attachments:object[]}[])=>void, askSide:(sessionId:string, question:string)=>void,
 *   composerText:()=>string}} view
 *   restore puts messages back into the composer (from the queue); askSide opens the /btw card.
 */
export function createActions(view) {
  const report = error => {
    if (isCancelled(error)) return toast(error.message); // the user said no to a warning; not an error
    console.error('[actions]', error);
    return toast(error.message, 'error');
  };

  /** Creates a session from the draft settings (folder, mode, model) for a first message. */
  async function createFromDraft(firstText, attachments = []) {
    const draft = state.draft;
    const cwd = draft.cwd || state.config.defaultCwd;
    const name = firstText && !firstText.startsWith('/') ? firstText.replace(/\s+/g, ' ').slice(0, 48)
      : attachments.length ? attachments[0].name : folderName(cwd);
    const session = await api.createSession({ name, cwd, mode: draft.mode, model: draft.model, effort: draft.effort });
    rememberFolder(session.cwd);
    state.sessions.set(session.id, session);
    view.selectSession(session.id);
    return session;
  }

  const actions = {
    insert: (text, options) => view.insert(text, options),
    openPanel: id => openPanel(id, panelContext),

    /**
     * Sends now, or queues the message when the session is still working (sent after the running turn).
     * @param {object[]} [attachments] composer attachments: images and files (attachments.js)
     */
    async send(text, attachments = []) {
      try {
        await confirmOutwardCommand(text);
        const session = activeSession() || await createFromDraft(text, attachments);
        const { images, files } = forServer(attachments);
        // a busy session queues it; the queue shows above the composer
        await api.sendMessage(session.id, text, images, files);
        return true;
      } catch (error) {
        report(error);
        return false;
      }
    },
    /** Stops the turn; queued messages come back into the composer instead of being sent. */
    async stop() {
      const session = activeSession();
      if (session?.status !== 'running') return;
      const result = await api.stop(session.id).catch(report);
      if (result?.queued?.length) {
        view.restore(result.queued.map(entry => ({ text: entry.text, attachments: fromStored(entry) })));
        toast('ההודעות שבתור הוחזרו לתיבת הכתיבה');
      }
    },
    /** /btw: a quick question about the conversation that neither waits for nor joins the running turn. */
    sideQuestion(question) {
      const session = activeSession();
      if (!session) return toast('שאלת צד שואלת על שיחה קיימת – פתח סשן קודם', 'error');
      if (!question.trim()) return view.insert('/btw ', { replace: true });
      return view.askSide(session.id, question.trim());
    },
    removeQueued(entry) {
      const session = activeSession();
      if (session) api.removeQueued(session.id, entry.id).catch(report);
    },
    /** Takes a queued message back into the composer for editing. */
    async editQueued(entry) {
      const session = activeSession();
      if (!session) return;
      await api.removeQueued(session.id, entry.id)
        .then(() => view.restore([{ text: entry.text, attachments: fromStored(entry) }])).catch(report);
    },
    resumeQueue() {
      const session = activeSession();
      if (session) api.resumeQueue(session.id).catch(report);
    },
    async clear() {
      const session = activeSession();
      if (!session) return;
      await api.clear(session.id);
      state.context.delete(session.id);
      toast('שיחה חדשה התחילה. הקודמת זמינה ב"שיחות קודמות".');
    },
    async fork() {
      const session = activeSession();
      if (!session) return;
      const fork = await api.fork(session.id);
      state.sessions.set(fork.id, fork);
      view.selectSession(fork.id);
      toast('נוצר ענף חדש של השיחה');
    },
    async rename(name) {
      const session = activeSession();
      if (!session) return;
      const newName = name || await ask({ title: 'שינוי שם', value: session.name, confirmLabel: 'שמירה' });
      if (newName) await api.updateSession(session.id, { name: newName });
    },
    /** Pins a session to the top of the sidebar (or unpins it). */
    setPinned(id, pinned) {
      api.updateSession(id, { pinned }).catch(report);
    },
    async remove() {
      const session = activeSession();
      if (!session || !await ask({ title: `למחוק את "${session.name}"?`, text: 'השיחה תימחק מהממשק. ב-Claude Code היא נשארת וניתן לפתוח אותה שוב מ"שיחות קודמות".', confirmLabel: 'מחיקה', danger: true })) return;
      await api.deleteSession(session.id).catch(report);
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
    /** Applies to the active session, or to the draft of the next new session. */
    async updateSettings(patch) {
      const session = activeSession();
      if (patch.mode && patch.mode !== (session || state.draft).mode) await confirmMode(patch.mode);
      if (session) await api.updateSession(session.id, patch);
      else Object.assign(state.draft, patch);
      view.refresh();
    },
    setMode: mode => actions.updateSettings({ mode }).catch(report),
    cycleMode() {
      const current = activeSession()?.mode || state.draft.mode;
      const cycle = MODE_CYCLE.filter(mode => availableModes(state.capabilities.permissionModes).some(item => item.value === mode));
      actions.setMode(cycle[(cycle.indexOf(current) + 1) % cycle.length]);
    },
    async control(subtype, successMessage) {
      await api.control(currentScope(), subtype);
      forgetCatalog();
      toast(successMessage);
    },
    toggleFocus(on) {
      state.focusView = on ?? !state.focusView;
      document.body.classList.toggle('focus-view', state.focusView);
      toast(state.focusView ? 'תצוגה ממוקדת פעילה (/focus לכיבוי)' : 'תצוגה רגילה');
    },
    answerPermission(prompt, answer) {
      const session = activeSession();
      if (session) api.answerPermission(session.id, prompt.requestId, answer).catch(report);
    },
  };

  function panelContext() {
    const session = activeSession();
    return {
      api: guardedApi, session, liveSession: () => activeSession(), scope: currentScope(), folder: scopeFolder(), config: state.config, capabilities: state.capabilities,
      draft: state.draft, getCatalog: options => getCatalog(currentScope(), options), getCommands: () => getCommands(currentScope()),
      insert: (text, options) => view.insert(text, options), send: text => actions.send(text), composerText: () => view.composerText(),
      updateSession: patch => actions.updateSettings(patch).catch(report), runCommand: name => actions[name]?.(),
      selectSession: created => { state.sessions.set(created.id, created); view.selectSession(created.id); },
      openSessionIds: () => new Set([...state.sessions.values()].map(item => item.claudeSessionId).filter(Boolean)),
      runtimeInfo: id => state.runtime.get(id) || null, refreshView: () => view.refresh(),
      focusView: () => state.focusView, toggleFocus: () => actions.toggleFocus(),
      // A "no" to a risk warning arrives as an error; show it as a plain note, not a red error.
      toast: (message, type) => toast(message, message === CANCELLED_MESSAGE ? 'info' : type), ask,
    };
  }

  return actions;
}
