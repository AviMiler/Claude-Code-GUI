/**
 * The question before a return to an earlier message (Claude Code Desktop's rewind): what to take back — the code, the
 * conversation, or both — with what each loses said plainly. Only the choices the CLI can do are offered.
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { fromStored } from '../attachments.js';

const LABELS = {
  both: ['קוד ושיחה', 'ההודעות מכאן והלאה יימחקו מהשיחה, והקבצים ש-Claude שינה אחרי ההודעה יחזרו למצבם הקודם.'],
  conversation: ['שיחה בלבד', 'ההודעות מכאן והלאה יימחקו מהשיחה. הקבצים נשארים כמו שהם.'],
  code: ['קוד בלבד', 'הקבצים ש-Claude שינה אחרי ההודעה יחזרו למצבם הקודם, והשיחה נשארת. Claude לא יידע שהקבצים הוחזרו.'],
};

function codeNote(code) {
  if (!code.available) return h('p', { class: 'rewind-note' }, `שחזור קבצים לא זמין: ${code.reason}`);
  return h('p', { class: 'rewind-note', dir: 'auto' }, `קבצים שישתנו: ${code.files.length ? code.files.join(', ') : 'אין'} · +${code.insertions} −${code.deletions}. `,
    'קבצים ש-Claude יצר יימחקו. שינויים שנעשו ידנית או דרך Bash לא נמצאים במעקב.');
}

/**
 * @param {string} sessionId @param {string} uuid the user message to go back to
 * @param {{restore:(entries:{text:string, attachments:object[]}[])=>void}} composer the message goes back into the composer
 */
export async function openRewindDialog(sessionId, uuid, { restore }) {
  let preview;
  try { preview = await api.rewindPreview(sessionId, uuid); } catch (error) { toast(error.message, 'error'); return; }
  const { code, conversation } = preview;
  const modes = [code.available && conversation.available && 'both', conversation.available && 'conversation', code.available && 'code'].filter(Boolean);
  let mode = modes[0];
  const dialog = h('dialog', { class: 'confirm rewind-dialog' });
  const close = () => { dialog.close(); dialog.remove(); };
  const detail = h('p', { class: 'rewind-detail', dir: 'auto' }, LABELS[mode]?.[1] || '');
  const choices = modes.map(value => {
    const input = h('input', { type: 'radio', name: 'rewind-mode', checked: value === mode, onChange: () => { mode = value; detail.textContent = LABELS[value][1]; } });
    return h('label', { class: 'rewind-choice' }, input, LABELS[value][0]);
  });
  const go = h('button', { type: 'button', class: 'btn danger', onClick: async () => {
    go.disabled = true;
    try {
      const result = await api.rewind(sessionId, uuid, mode);
      close();
      toast(mode === 'code' ? 'הקבצים הוחזרו' : 'חזרת להודעה. הטקסט שלה בתיבת הכתיבה לעריכה.');
      if (mode !== 'code') restore([{ text: result.text, attachments: fromStored(result) }]);
    } catch (error) {
      go.disabled = false;
      toast(error.message, 'error');
    }
  } }, 'חזרה');
  dialog.append(...[h('h2', null, icon('history'), 'חזרה לנקודה קודמת'),
    h('p', { class: 'rewind-quote', dir: 'auto' }, preview.text.length > 160 ? `${preview.text.slice(0, 160)}…` : preview.text),
    h('div', { class: 'rewind-choices' }, choices), detail, conversation.available ? null : h('p', { class: 'rewind-note' }, `חזרה בשיחה לא זמינה: ${conversation.reason}`), codeNote(preview.code),
    ...(preview.runningTasks ? [h('p', { class: 'rewind-note warn' }, preview.runningTasks === 1 ? 'משימת רקע אחת רצה ותיעצר (Claude Code מופעל מחדש).' : `${preview.runningTasks} משימות רקע רצות ויעצרו (Claude Code מופעל מחדש).`)] : []),
    h('div', { class: 'card-actions' }, h('button', { type: 'button', class: 'btn ghost', onClick: close }, 'ביטול'), modes.length ? go : null)].filter(Boolean)); // native append would print a null
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.body.append(dialog);
  dialog.showModal();
}
