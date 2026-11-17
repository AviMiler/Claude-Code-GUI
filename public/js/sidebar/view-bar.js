/** The bar above the session list: grouping and sort (remembered per browser) and "new group". All real selects/buttons: keyboard ready. */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { viewPrefs, saveViewPrefs } from './prefs.js';
import { createGroupDialog } from './groups-store.js';

const GROUPING_LABELS = { date: 'לפי תאריך', project: 'לפי תיקייה (פרויקט)', none: 'רשימה אחת' };
const SORT_LABELS = { activity: 'פעילות אחרונה', created: 'תאריך יצירה', name: 'שם' };

function picker(label, labels, current, onPick) {
  const select = h('select', { class: 'view-select', 'aria-label': label, title: label,
    onChange: () => onPick(select.value) }, ...Object.entries(labels).map(([value, text]) => h('option', { value, selected: value === current }, text)));
  return select;
}

/**
 * @param {() => void} onChange re-renders the list
 * @returns {HTMLElement}
 */
export function viewBar(onChange) {
  const { grouping, sort } = viewPrefs();
  const change = key => value => { saveViewPrefs({ [key]: value }); onChange(); };
  return h('div', { class: 'view-bar' },
    picker('קיבוץ הסשנים', GROUPING_LABELS, grouping, change('grouping')),
    picker('מיון הסשנים', SORT_LABELS, sort, change('sort')),
    h('button', { type: 'button', class: 'icon-button', title: 'קבוצה חדשה', 'aria-label': 'קבוצה חדשה',
      onClick: async () => { if (await createGroupDialog()) onChange(); } }, icon('plus')));
}
