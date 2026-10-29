/** A `!` command saved in the conversation (item kind `shell`): what the user ran and what it printed. */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { shellBlock } from './shell-block.js';

export function renderShellItem(item) {
  return h('div', { class: 'shell-item' }, h('div', { class: 'head' }, icon('terminal'), 'פקודת shell (!)'), shellBlock({ ...item, running: false }));
}

/** The item as lines of Markdown for /export. */
export const shellItemMarkdown = item => ['```', `$ ${item.command}`, ...[item.stdout, item.stderr].filter(Boolean), '```', ''];
