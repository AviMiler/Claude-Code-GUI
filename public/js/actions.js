/** What the user can do to sessions (send, stop, clear, fork, rename, settings...) and the context given to panels. */
import { api } from './api.js';
import { state, activeSession, currentScope, scopeFolder, getCatalog, getCommands, forgetCatalog } from './state.js';
import { availableModes, MODE_CYCLE } from './modes.js';
import { forServer, fromStored } from './attachments.js';
import { openPanel } from './panels/panel-host.js';
import { toast, ask } from './ui.js';
import { createSessionActions } from './session-actions.js';
import { rewindLast } from './rewind/rewind-menu.js';
import { setSessionColor } from './session-color/color-command.js';
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

  const { createFromDraft, actions: sessionActions } = createSessionActions(view, report);

  const actions = {
    ...sessionActions,
    insert: (text, options) => view.insert(text, options),
    openPanel: id => openPanel(id, panelContext),

    /**
     * Sends now; while the session works, into the running turn as a correction ('correct') or after it ('queue').
     * @param {object[]} [attachments] composer attachments: images and files (attachments.js)
     * @param {'correct'|'queue'} [delivery] none: the queue (the Changes pane's comments wait for the turn's end)
     */
    async send(text, attachments = [], delivery) {
      try {
        await confirmOutwardCommand(text);
        const session = activeSession() || await createFromDraft(text, attachments);
        const { images, files } = forServer(attachments);
        await api.sendMessage(session.id, text, images, files, delivery);
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
    rewind: () => rewindLast(activeSession()),
    setColor: args => Promise.resolve(setSessionColor(activeSession(), args, patch => actions.updateSettings(patch), name => actions.openPanel(name))).catch(report),
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
