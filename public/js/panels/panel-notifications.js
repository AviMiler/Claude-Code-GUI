/** Notifications panel: the user picks the channels (desktop, sound, tab title), the events, and when to be told. */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { section, button, badge } from './kit.js';
import {
  notifyPreferences, saveNotifyPreferences, desktopPermission, requestDesktopPermission, testNotification,
} from '../notify.js';

const PERMISSION_TEXT = {
  granted: ['מאושר', 'success'], denied: ['חסום בדפדפן', 'danger'], default: ['טרם אושר', 'warning'], unsupported: ['לא נתמך', ''],
};

/** One labelled checkbox bound to a preference key. */
function toggle(key, title, description, onChange) {
  const input = h('input', { type: 'checkbox', checked: notifyPreferences()[key], onChange: () => onChange({ [key]: input.checked }) });
  return h('label', { class: 'check-row' }, input, h('span', null, h('b', null, title), description ? h('small', null, description) : null));
}

/**
 * @param {HTMLElement} body
 * @param {{rerender:()=>void, refreshView:()=>void, toast:(message:string, type?:string)=>void}} context
 */
export function renderNotificationsPanel(body, context) {
  const save = patch => { saveNotifyPreferences(patch); context.refreshView(); };
  const preferences = notifyPreferences();
  const permission = desktopPermission();
  const [permissionLabel, permissionTone] = PERMISSION_TEXT[permission];

  const desktopToggle = toggle('desktop', 'התראת מערכת', 'חלון קטן בפינת המסך, גם כשהדפדפן ממוזער. לחיצה עליו פותחת את הסשן.', async patch => {
    if (patch.desktop && desktopPermission() === 'default') await requestDesktopPermission();
    if (patch.desktop && desktopPermission() !== 'granted') context.toast('הדפדפן לא אישר התראות. אפשר לאשר בהגדרות האתר (סמל המנעול בשורת הכתובת).', 'error');
    save(patch);
    context.rerender();
  });
  const volume = h('input', { type: 'range', min: 0, max: 100, step: 5, value: preferences.volume, disabled: !preferences.sound,
    'aria-label': 'עוצמה', onChange: () => save({ volume: Number(volume.value) }) });

  body.append(section('איך להתריע', 'אפשר לבחור כמה ערוצים יחד.',
    h('div', { class: 'check-list' },
      desktopToggle,
      h('div', { class: 'check-note' }, 'הרשאת הדפדפן: ', badge(permissionLabel, permissionTone),
        permission === 'default' ? button('בקשת הרשאה', async () => { await requestDesktopPermission(); context.rerender(); }) : null),
      toggle('sound', 'צליל', 'צליל קצר שונה לכל סוג: עולה – סיום, כפול – המתנה, יורד – שגיאה.', patch => { save(patch); context.rerender(); }),
      h('label', { class: 'check-note' }, 'עוצמה', volume),
      toggle('title', 'מונה בכותרת הלשונית', 'למשל "(2) Claude Code" – כמה סשנים ממתינים לך או סיימו ועוד לא נקראו.', save))));

  body.append(section('על מה להתריע', null, h('div', { class: 'check-list' },
    toggle('onDone', 'Claude סיים', 'התור הסתיים והתשובה מוכנה.', save),
    toggle('onWaiting', 'Claude ממתין לך', 'בקשת הרשאה, שאלה או אישור תוכנית.', save),
    toggle('onError', 'שגיאה', 'הריצה נכשלה או ש-Claude Code קרס. עצירה שלך לא נחשבת.', save))));

  const whenOptions = [
    { value: 'away', label: 'רק כשאני לא מסתכל', desc: 'הלשונית מוסתרת, החלון לא בפוקוס, או שפתוח סשן אחר.', iconName: 'eye' },
    { value: 'always', label: 'תמיד', desc: 'גם על הסשן שפתוח מולי.', iconName: 'bell' },
  ];
  body.append(section('מתי', 'המונה בכותרת לא תלוי בבחירה הזאת.', h('div', { class: 'radio-cards' }, whenOptions.map(option => h('button', {
    type: 'button', class: `radio-card${preferences.when === option.value ? ' on' : ''}`, onClick: () => { save({ when: option.value }); context.rerender(); },
  }, icon(option.iconName), h('b', null, option.label), preferences.when === option.value ? badge('נבחר', 'accent') : h('span'), h('span', null, option.desc))))));

  body.append(section('בדיקה', 'משמיע ומציג דוגמה דרך הערוצים שנבחרו.', h('div', { class: 'panel-toolbar' },
    button('סיום', () => testNotification('done'), { iconName: 'check-circle' }),
    button('המתנה', () => testNotification('waiting'), { iconName: 'hand' }),
    button('שגיאה', () => testNotification('error'), { iconName: 'alert' }))));
}
