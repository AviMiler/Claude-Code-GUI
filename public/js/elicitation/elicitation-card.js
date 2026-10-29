/**
 * The card for an MCP elicitation (a server asks the user for input): its message, a form or a link, and the three
 * answers Desktop offers: send (accept), decline, cancel. Nothing is answered unless the user presses a button.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { createForm } from './elicitation-fields.js';
import { urlBlock } from './elicitation-url.js';

/**
 * @param {{serverName:string, message:string, mode:'form'|'url', url:string, fields:object[]}} prompt
 * @param {(answer:{action:'accept'|'decline'|'cancel', content?:object})=>void} answer
 * @returns {HTMLElement}
 */
export function elicitationCard(prompt, answer) {
  const form = prompt.mode === 'form' ? createForm(prompt.fields) : null;
  const problem = h('div', { class: 'el-error', role: 'alert', hidden: true });
  const accept = () => {
    const result = form ? form.read() : {};
    problem.hidden = !result.error;
    problem.textContent = result.error || '';
    if (!result.error) answer({ action: 'accept', ...(result.content && { content: result.content }) });
  };
  return h('div', { class: 'prompt-card attention elicitation' },
    h('h3', null, icon('plug'), `שרת MCP "${prompt.serverName}" מבקש מידע`),
    prompt.message ? h('p', { dir: 'auto', class: 'el-message' }, prompt.message) : null,
    form ? form.node : urlBlock(prompt.url), problem,
    h('div', { class: 'card-actions' },
      h('button', { type: 'button', class: 'btn primary', onClick: accept }, icon('check'), form ? 'שליחה' : 'סיימתי'),
      h('button', { type: 'button', class: 'btn', onClick: () => answer({ action: 'decline' }) }, 'דחייה'),
      h('button', { type: 'button', class: 'btn ghost', onClick: () => answer({ action: 'cancel' }) }, 'ביטול')));
}
