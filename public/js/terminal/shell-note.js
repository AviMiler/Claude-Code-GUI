/** A line above the composer: "shell mode" while the text starts with `!`, and how many `!` commands wait for Claude. */
import { h } from '../dom.js';

/** @returns {{node:HTMLElement, update:(session:object|null, text:string)=>void}} */
export function createShellNote() {
  const node = h('p', { class: 'shell-note', hidden: true, 'aria-live': 'polite' });
  return {
    node,
    update(session, text) {
      const waiting = session?.shellContext?.length || 0;
      const parts = [
        text.startsWith('!') && 'מצב shell: Enter מריץ את הפקודה בתיקיית הסשן',
        waiting && `${waiting === 1 ? 'פקודת shell אחת תצורף' : `${waiting} פקודות shell יצורפו`} להודעה הבאה ל-Claude`,
      ].filter(Boolean);
      node.hidden = !parts.length;
      node.textContent = parts.join(' · ');
    },
  };
}
