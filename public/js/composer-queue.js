/**
 * The composer's queue: messages sent with Alt+Enter while Claude works wait here and are sent one by one after the
 * turn (Enter instead joins the running turn as a correction; lib/runtime-corrections.js).
 */
import { h } from './dom.js';
import { icon } from './icons.js';

/** @param {object[]} queue the session's queue @param {boolean} running @param {{onQueueEdit, onQueueRemove, onQueueResume}} handlers */
export function queueList(queue, running, handlers) {
  const rows = queue.map((entry, index) => h('div', { class: 'queue-row' },
    h('span', { class: 'queue-index' }, String(index + 1)),
    h('span', { class: 'queue-text', dir: 'auto', title: entry.text },
      entry.images?.length ? h('span', { class: 'queue-images' }, icon('image'), String(entry.images.length)) : null,
      entry.files?.length ? h('span', { class: 'queue-images' }, icon('file'), String(entry.files.length)) : null, entry.text),
    h('button', { type: 'button', class: 'icon-button', title: 'עריכה (מחזיר לתיבת הכתיבה)', onClick: () => handlers.onQueueEdit(entry) }, icon('pencil')),
    h('button', { type: 'button', class: 'icon-button', title: 'הסרה מהתור', onClick: () => handlers.onQueueRemove(entry) }, icon('x'))));
  const head = h('div', { class: 'queue-head' }, icon('list'),
    h('span', null, running ? `בתור (${queue.length}) – יישלחו כש-Claude יסיים` : `בתור (${queue.length}) – התור עצר`),
    running ? null : h('button', { type: 'button', class: 'btn small primary', onClick: handlers.onQueueResume }, 'שליחת הבאה'));
  return [head, ...rows];
}

/** The send button's tooltip: a correction while Claude works. */
export const sendTitle = running => (running ? 'תיקון באמצע התור (Enter) – Claude יראה אותו בצעד הבא · Alt+Enter: לתור, אחרי שיסיים'
  : 'שליחה (Enter)');
