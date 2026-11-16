/**
 * The form of one scheduled task (new or edited): name, instructions, project folder, schedule, permission mode with
 * its warning, model, effort, active. The server validates everything again (lib/schedule/schedule-validate.js).
 */
import { h } from '../dom.js';
import { field, select, button } from '../panels/kit.js';
import { availableModes, EFFORT_LEVELS } from '../modes.js';
import { pickFolder } from '../folder-browser.js';
import { confirmMode } from '../risk.js';
import { scheduleFields } from './schedule-fields.js';
import { modeWarning } from './schedule-labels.js';

/**
 * @param {object|null} task the stored task, null for a new one
 * @param {{api:object, toast:Function, capabilities:object, folder:string, onDone:(saved:boolean)=>void}} options
 * @returns {HTMLElement}
 */
export function scheduleForm(task, { api, toast, capabilities, folder, onDone }) {
  const draft = task || { name: '', prompt: '', folder, mode: 'acceptEdits', model: '', effort: '', active: true, schedule: { kind: 'daily', time: '09:00' } };
  const name = h('input', { value: draft.name, maxlength: 80, dir: 'auto', placeholder: 'למשל: סיכום שינויים יומי' });
  const prompt = h('textarea', { class: 'code markdown-editor', dir: 'auto', maxlength: 20000, placeholder: 'מה Claude יעשה בכל ריצה…' }, draft.prompt);
  const folderInput = h('input', { value: draft.folder || '', dir: 'ltr', spellcheck: false });
  const browse = button('בחירה…', async () => { const chosen = await pickFolder(folderInput.value); if (chosen) folderInput.value = chosen; }, { iconName: 'folder' });
  const modes = availableModes(capabilities?.permissionModes || []);
  const mode = select(modes.map(item => ({ value: item.value, label: item.label })), draft.mode);
  const warning = h('div', { class: 'schedule-warning', role: 'note' });
  const showWarning = () => { const text = modeWarning(mode.value); warning.hidden = !text; warning.textContent = text; warning.classList.toggle('danger', mode.value === 'bypassPermissions'); };
  mode.addEventListener('change', showWarning);
  showWarning();
  const model = h('input', { value: draft.model || '', dir: 'ltr', spellcheck: false, placeholder: 'ברירת המחדל של ה-GUI' });
  const effort = select(EFFORT_LEVELS, draft.effort || '');
  const active = h('input', { type: 'checkbox', checked: draft.active !== false });
  const schedule = scheduleFields(draft.schedule, api.schedule);

  async function save(event) {
    const saveButton = event.currentTarget; // currentTarget is gone after the first await
    const body = { name: name.value, prompt: prompt.value, folder: folderInput.value.trim(), mode: mode.value, model: model.value.trim(), effort: effort.value, active: active.checked, schedule: schedule.value() };
    try {
      if (mode.value !== draft.mode || !task) await confirmMode(mode.value); // the same warning as switching a session to it
      saveButton.disabled = true;
      if (task) await api.schedule.update(task.id, body); else await api.schedule.create(body);
      toast('המשימה נשמרה');
      onDone(true);
    } catch (error) {
      toast(error.message, error.cancelled ? 'info' : 'error');
    } finally { saveButton.disabled = false; }
  }

  return h('div', { class: 'schedule-form' },
    field('שם', name, { wide: true }), field('הוראות', prompt, { wide: true }),
    field('תיקיית פרויקט', h('div', { class: 'schedule-folder' }, folderInput, browse), { wide: true }),
    schedule.node,
    field('מצב הרשאות', mode), warning,
    field('מודל', model), field('מאמץ', effort),
    h('label', { class: 'schedule-active' }, active, 'פעילה (רצה לפי התזמון)'),
    h('div', { class: 'panel-toolbar' }, button('שמירה', save, { variant: 'primary', iconName: 'check' }), button('ביטול', () => onDone(false))));
}
