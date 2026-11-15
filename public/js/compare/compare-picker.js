/** The small picker of "Compare": which model and effort the fork answers with (the model chip's list, modes.js levels). */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { getModels } from '../state.js';
import { EFFORT_LEVELS } from '../modes.js';

const KEEP = '__keep';
const field = (label, control) => h('label', { class: 'compare-field' }, h('span', null, label), control);
const select = (options, name) => h('select', { name }, options.map(([value, text]) => h('option', { value }, text)));

/** @returns {Promise<{model?:string, effort?:string}|null>} what to set on the fork (absent key: as the original); null when cancelled */
export async function pickCompare() {
  const { models } = await getModels();
  const model = models.length > 1 ? select([[KEEP, 'כמו בשיחה המקורית'], ...models.map(item => [item.value, item.displayName || item.value])], 'model') : null;
  const effort = select([[KEEP, 'כמו בשיחה המקורית'], ...EFFORT_LEVELS.map(level => [level.value, level.label])], 'effort');
  return new Promise(resolve => {
    const dialog = h('dialog', { class: 'confirm compare-dialog' });
    const done = value => { dialog.close(); dialog.remove(); resolve(value); };
    const go = () => {
      const settings = {};
      if (model && model.value !== KEEP) settings.model = model.value === 'default' ? '' : model.value;
      if (effort.value !== KEEP) settings.effort = effort.value;
      done(settings);
    };
    dialog.append(...[h('h2', null, icon('columns'), 'השוואה בענף'),
      h('p', { class: 'compare-note' }, 'נוצר ענף של השיחה, ההודעה האחרונה נשלחת בו שוב ומוצגת לצד המקור. הענף כבר מכיל את התשובה הקודמת, ולכן התשובה השנייה היא "ניסיון נוסף אחרי הראשון" ולא תשובה מנקודת האפס.'),
      model && field('מודל', model), field('רמת מאמץ', effort),
      h('div', { class: 'card-actions' }, h('button', { type: 'button', class: 'btn ghost', onClick: () => done(null) }, 'ביטול'), h('button', { type: 'button', class: 'btn', onClick: go }, 'השווה'))].filter(Boolean));
    dialog.addEventListener('cancel', event => { event.preventDefault(); done(null); });
    document.body.append(dialog);
    dialog.showModal();
  });
}
