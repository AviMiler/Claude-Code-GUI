/** The copy button of each message (render-items.js draws it): copies the message's source and shows a check mark. */
import { copyText } from './dom.js';
import { icon } from './icons.js';
import { copySourceOf } from './render-items.js';

/** @param {HTMLElement} messages a thread's message list (one listener for all its buttons) */
export function enableMessageCopy(messages) {
  messages.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-message]');
    const text = button && copySourceOf(button);
    if (text === null || text === undefined) return;
    await copyText(text);
    button.replaceChildren(icon('check')); // icon-only button: a check mark says it was copied
    button.title = 'הועתק';
    setTimeout(() => { button.replaceChildren(icon('copy')); button.title = 'העתקה'; }, 1400);
  });
}
