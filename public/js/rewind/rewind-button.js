/** The "back to this message" button on a user message (hover); the click is handled for the whole page (rewind-menu.js). */
import { h } from '../dom.js';
import { icon } from '../icons.js';

export const rewindButton = () => h('button', { type: 'button', class: 'icon-button rewind-button', title: 'חזרה להודעה זו', 'aria-label': 'חזרה להודעה זו', dataset: { rewind: '' } }, icon('history'));
