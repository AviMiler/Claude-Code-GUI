/**
 * /btw side-question card above the composer: asks Claude about the conversation without interrupting the running
 * turn and without adding to the conversation. Follow-ups in the same card carry the earlier questions (history);
 * closing the card forgets them, like the terminal's /btw.
 */
import { api } from './api.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { isUnsupported } from './panels/kit.js';

/**
 * @param {HTMLElement} host where the card is shown (the composer area)
 * @returns {{ask:(sessionId:string, question:string)=>Promise<void>, close:()=>void, sessionChanged:(sessionId:string|null)=>void}}
 * @example const side = createSideQuestions(composerArea); side.ask(session.id, 'Which file are you editing?')
 */
export function createSideQuestions(host) {
  let card = null; // { sessionId, node, list, input, history: [{question, response}] }

  function close() {
    card?.node.remove();
    card = null;
  }

  function open(sessionId) {
    if (card?.sessionId === sessionId) return card;
    close();
    const list = h('div', { class: 'side-list' });
    const input = h('input', { placeholder: 'שאלת המשך…', dir: 'auto', 'aria-label': 'שאלת המשך' });
    const node = h('div', { class: 'prompt-card side-card', role: 'dialog', 'aria-label': 'שאלת צד' },
      h('h3', null, icon('message'), 'שאלת צד', h('small', null, 'לא נכנסת לשיחה ולא עוצרת את Claude'),
        h('button', { type: 'button', class: 'icon-button', title: 'סגירה (Esc)', onClick: close }, icon('x'))),
      list, input);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing && input.value.trim()) {
        event.preventDefault();
        const question = input.value.trim();
        input.value = '';
        ask(sessionId, question);
      }
    });
    node.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    });
    host.prepend(node);
    card = { sessionId, node, list, input, history: [] };
    return card;
  }

  /** Asks one question; the answer replaces the loader in the card. */
  async function ask(sessionId, question) {
    const current = open(sessionId);
    const answer = h('div', { class: 'side-answer' }, h('span', { class: 'loading' }, icon('loader', 'spinning'), 'חושב…'));
    current.list.append(h('div', { class: 'side-question', dir: 'auto' }, question), answer);
    current.input.focus();
    const history = [...current.history];
    try {
      const { response, notice } = await api.sideQuestion(sessionId, question, history);
      const text = response ?? '(לא התקבלה תשובה)';
      if (response !== null) current.history.push({ question, response });
      answer.replaceChildren(h('div', { class: 'markdown', dir: 'auto', html: renderMarkdown(text) }));
      if (notice) answer.append(h('p', { class: 'side-notice', dir: 'auto' }, notice));
    } catch (error) {
      if (!isUnsupported(error)) console.error('[side-question] failed:', error);
      answer.replaceChildren(h('div', { class: isUnsupported(error) ? 'empty-state' : 'error-box', dir: 'auto' },
        isUnsupported(error) ? 'שאלות צד (/btw) לא זמינות בגרסת Claude Code המותקנת.' : error.message));
    }
  }

  return {
    ask,
    close,
    /** The card belongs to one session; another session on screen hides it. */
    sessionChanged(sessionId) { if (card && card.sessionId !== sessionId) close(); },
  };
}
