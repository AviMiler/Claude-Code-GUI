/** "תיקיות worktree" panel: every session worktree folder of the known projects, with a safe removal (never --force, the branch stays). */
import { h } from '../dom.js';
import { ask } from '../ui.js';
import { section, badge, button, row, list, load, empty } from './kit.js';

const OWNER = { live: ['סשן פעיל', 'info'], archived: ['סשן בארכיון', 'accent'], none: ['ללא סשן', ''] };

/** @returns {Promise<boolean>} whether the user confirmed; the text names the folder and the branch */
function confirmRemoval(entry) {
  const restore = entry.owner === 'archived' ? '\nהסשן בארכיון יישאר, ואפשר לשחזר אותו: השחזור יוצר את התיקייה מחדש מהענף.' : '';
  return ask({ title: 'הסרת תיקיית worktree', danger: true, confirmLabel: 'הסרה',
    text: `התיקייה:\n${entry.path}\nהענף: ${entry.branch || '(ללא)'}\n\nהתיקייה תימחק מהדיסק (כולל קבצים ש-git מתעלם מהם). הענף נשאר.${restore}` });
}

function entryRow(entry, context, reload) {
  const [ownerText, ownerTone] = OWNER[entry.owner];
  const badges = [badge(ownerText, ownerTone)];
  if (entry.ahead) badges.push(badge(`${entry.ahead === 1 ? 'קומיט אחד' : `${entry.ahead} קומיטים`} לפני ענף הפרויקט`, 'warning'));
  if (!entry.exists) badges.push(badge('התיקייה חסרה', 'danger'));
  else badges.push(entry.dirty ? badge('יש שינויים לא שמורים', 'danger') : badge('נקי', 'success'));
  const remove = button(entry.exists ? 'הסרה' : 'ניקוי רשומה', async () => {
    if (!await confirmRemoval(entry)) return;
    try {
      await context.api.removeWorktree(entry.path);
      context.toast(entry.branch ? `התיקייה הוסרה. הענף ${entry.branch} נשאר.` : 'התיקייה הוסרה.', 'success');
    } catch (error) { context.toast(error.message, 'error'); }
    reload();
  }, { variant: 'danger', iconName: 'trash' });
  const actions = entry.removable ? [remove] : entry.dirty ? [] : [h('small', { class: 'hint' }, entry.reason)];
  return row({ title: h('span', { dir: 'ltr' }, entry.branch || '(ללא ענף)'), sub: entry.path, mono: true, badges, actions,
    details: entry.ownerName ? h('small', { class: 'hint' }, `סשן: ${entry.ownerName}`) : null });
}

/** @param {HTMLElement} body @param {{api:object, toast:Function}} context */
export function renderWorktreesPanel(body, context) {
  const box = h('div');
  const reload = () => load(box, () => context.api.worktrees(), ({ projects }) => {
    if (!projects.length) return empty('אין תיקיות worktree של סשנים.');
    return projects.map(project => section(project.root, null, list(project.worktrees.map(entry => entryRow(entry, context, reload)))));
  });
  body.append(
    section('תיקיות worktree', 'תיקיות העבודה שנוצרו לסשנים בכל פרויקט (.claude/worktrees). אפשר להסיר תיקייה רק כשאין סשן פעיל שמשתמש בה ואין בה שינויים לא שמורים.', box),
    section('הערות', null, h('small', { class: 'hint' }, 'הסרה היא בלי force ובלי מחיקת הענף: הענף נשאר במאגר. הסרה בכוח ומחיקת ענף נעשות בטרמינל.'),
      h('br'), h('small', { class: 'hint' }, 'מגבלה: מאגרים ש-GUI אינו מכיר מסשן קיים אינם מופיעים כאן.')));
  reload();
}
