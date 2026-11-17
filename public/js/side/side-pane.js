/**
 * Side question pane ("שאלת צד", like Claude Desktop's side chat): the /btw questions of a session as a small thread with
 * its own input. A side question asks Claude about the conversation without interrupting the running turn and without
 * joining it. The thread lives in browser memory, per session, for this page load (the server keeps nothing); earlier
 * answers travel with each new question as its history. An answer that arrives while the tab is not shown puts a dot on it.
 */
import { api } from '../api.js';
import { h, copyText } from '../dom.js';
import { icon } from '../icons.js';
import { renderMarkdown } from '../markdown.js';
import { isUnsupported } from '../panels/kit.js';
import { toast } from '../ui.js';
import { markDot } from '../panes/pane-attention.js';

const UNSUPPORTED = 'שאלות צד (/btw) לא זמינות בגרסת Claude Code המותקנת.';

/**
 * @param {{open:(id:string)=>void, isActive:(id:string)=>boolean, rerender:()=>void}} host the pane host's open / isActive,
 *   and a page refresh (the top bar shows the dot)
 * @returns {{pane:import('../panes/pane-host.js').PaneDefinition, ask:(sessionId:string, question:string)=>Promise<void>,
 *   focusInput:(sessionId:string)=>void}}
 * @example const side = createSidePane({ open, isActive, rerender }); side.ask(session.id, 'Which file are you editing?')
 */
export function createSidePane({ open, isActive, rerender }) {
  const threads = new Map(); // sessionId -> [{ question, response, notice, error, status: 'pending'|'done'|'error' }]
  const drafts = new Map(); // sessionId -> text typed in the input and not sent
  let view = null; // { sessionId, list, input }: built on the first render, the body is attached once and never moved

  const entriesOf = id => { if (!threads.has(id)) threads.set(id, []); return threads.get(id); };

  function copyButton(entry) {
    return h('button', { type: 'button', class: 'side-copy', title: 'העתקת התשובה', onClick: async event => {
      const button = event.currentTarget; // null after the await
      await copyText(entry.response);
      toast('התשובה הועתקה');
      button.blur();
    } }, icon('copy'), 'העתקת תשובה');
  }

  function answerNode(entry) {
    if (entry.status === 'pending') return h('div', { class: 'side-answer loading' }, icon('loader', 'spinning'), 'חושב…');
    if (entry.status === 'error') return h('div', { class: entry.unsupported ? 'empty-state' : 'error-box', dir: 'auto' }, entry.error);
    return h('div', { class: 'side-answer' }, h('div', { class: 'markdown', dir: 'auto', html: renderMarkdown(entry.response) }),
      entry.notice ? h('p', { class: 'side-notice', dir: 'auto' }, entry.notice) : null, copyButton(entry));
  }

  function draw() {
    if (!view) return;
    const entries = entriesOf(view.sessionId);
    view.list.replaceChildren(...(entries.length ? entries.flatMap(entry => [h('div', { class: 'side-question', dir: 'auto' }, entry.question), answerNode(entry)])
      : [h('p', { class: 'side-empty' }, 'שאלה קצרה ל-Claude על השיחה, בלי להפריע לו ובלי שתיכנס לשיחה. כתוב אותה למטה או הקלד /btw בתיבת הכתיבה.')]));
    view.list.scrollTop = view.list.scrollHeight;
  }

  async function ask(sessionId, question) {
    const entries = entriesOf(sessionId);
    const history = entries.filter(entry => entry.status === 'done').map(({ question: q, response }) => ({ question: q, response }));
    const entry = { question, response: null, notice: null, error: null, status: 'pending' };
    entries.push(entry);
    open('side'); // shows the tab (the drawer when there is no room) and draws it
    draw();
    try {
      const { response, notice } = await api.sideQuestion(sessionId, question, history);
      if (response === null) Object.assign(entry, { status: 'error', error: '(לא התקבלה תשובה)' });
      else Object.assign(entry, { status: 'done', response, notice });
    } catch (error) {
      if (!isUnsupported(error)) console.error('[side-question] failed:', error);
      Object.assign(entry, { status: 'error', unsupported: isUnsupported(error), error: isUnsupported(error) ? UNSUPPORTED : error.message });
    }
    if (view?.sessionId === sessionId) draw();
    if (!(isActive('side') && view?.sessionId === sessionId)) { markDot(sessionId, 'side'); rerender(); }
  }

  function build(body) {
    const list = h('div', { class: 'side-list', 'aria-live': 'polite' });
    const input = h('textarea', { rows: 2, dir: 'auto', placeholder: 'שאלת צד…', title: 'Enter לשליחה, Shift+Enter לשורה חדשה', 'aria-label': 'שאלת צד' });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      const text = input.value.trim();
      if (!text || !view) return;
      input.value = '';
      ask(view.sessionId, text);
    });
    body.append(list, h('div', { class: 'side-form' }, input));
    return { sessionId: null, list, input };
  }

  return {
    ask,
    /** Ctrl+; : shows the tab with the cursor in its input. */
    focusInput(sessionId) {
      open('side');
      setTimeout(() => { if (view?.sessionId === sessionId) view.input.focus(); }); // after the drawer put the focus on the tab
    },
    pane: {
      id: 'side', title: 'שאלת צד', icon: 'message',
      render(body, session) {
        view ||= build(body);
        if (view.sessionId === session.id) return;
        if (view.sessionId) drafts.set(view.sessionId, view.input.value);
        view.sessionId = session.id;
        view.input.value = drafts.get(session.id) || '';
        draw();
      },
    },
  };
}
