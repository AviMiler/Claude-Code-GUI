/** User-chosen notifications (desktop, sound, tab-title count) when a turn ends, waits for approval, or fails. */

const PREFERENCES_KEY = 'claude-gui.notifications';

/** @typedef {'done'|'waiting'|'error'} NotifyKind */
/**
 * @typedef {object} NotifyPreferences
 * @property {boolean} desktop  system notification (browser Notification API)
 * @property {boolean} sound    short tone made with WebAudio (no audio files: the machine is offline)
 * @property {boolean} title    count of sessions that need attention in the tab title
 * @property {number} volume    0..100
 * @property {boolean} onDone   a turn finished
 * @property {boolean} onWaiting  a permission, question or plan card waits for the user
 * @property {boolean} onError  a turn failed or the CLI crashed
 * @property {'away'|'always'} when  away: only when the tab is hidden or the session is not the one on screen
 */
const NOTIFY_DEFAULTS = Object.freeze({
  desktop: false, sound: false, title: true, volume: 60, onDone: true, onWaiting: true, onError: true, when: 'away',
});

const PREFERENCE_BY_KIND = { done: 'onDone', waiting: 'onWaiting', error: 'onError' };
const TEXTS = {
  done: { title: 'Claude סיים', body: 'התשובה מוכנה' },
  waiting: { title: 'Claude ממתין לך', body: 'יש בקשה שמחכה לאישור' },
  error: { title: 'הריצה נכשלה', body: 'Claude נעצר עם שגיאה' },
};
// Frequencies (Hz) of the notes of each tone: rising = done, a double knock = waiting, falling = error.
const TONES = { done: [660, 880], waiting: [880, 880], error: [440, 294] };

/** @returns {NotifyPreferences} */
export function notifyPreferences() {
  try {
    return { ...NOTIFY_DEFAULTS, ...JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}') };
  } catch {
    return { ...NOTIFY_DEFAULTS };
  }
}

/** @param {Partial<NotifyPreferences>} patch @returns {NotifyPreferences} the saved preferences */
export function saveNotifyPreferences(patch) {
  const next = { ...notifyPreferences(), ...patch };
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next)); } catch { /* storage may be blocked */ }
  return next;
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export const desktopPermission = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

/** Asks the browser for permission to show system notifications (must run from a click). @returns {Promise<string>} */
export async function requestDesktopPermission() {
  if (desktopPermission() !== 'default') return desktopPermission();
  return Notification.requestPermission();
}

let audio = null;
// Browsers keep audio locked until the page gets a click or a key; unlock it on the first one.
function unlockAudio() {
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  } catch (error) {
    console.error('[notify] audio is not available:', error);
  }
}
['pointerdown', 'keydown'].forEach(type => window.addEventListener(type, unlockAudio, { once: true, capture: true }));

/** Plays the tone of a kind. @param {NotifyKind} kind @param {number} volume 0..100 */
export function playTone(kind, volume = notifyPreferences().volume) {
  unlockAudio();
  if (!audio || audio.state !== 'running') return;
  const peak = Math.max(0, Math.min(100, volume)) / 100 * 0.3;
  TONES[kind].forEach((frequency, index) => {
    const start = audio.currentTime + index * 0.16;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak || 0.0001, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.15);
  });
}

function showDesktop(kind, session, onOpen) {
  if (desktopPermission() !== 'granted') return;
  try {
    const notification = new Notification(TEXTS[kind].title, {
      body: session ? `${session.name} – ${TEXTS[kind].body}` : TEXTS[kind].body,
      tag: `claude-gui:${session?.id || 'test'}`, // one notification per session, the newest replaces the old one
      icon: 'icon.svg', lang: 'he', dir: 'rtl',
    });
    notification.onclick = () => { window.focus(); notification.close(); if (session) onOpen(session.id); };
  } catch (error) {
    console.error('[notify] desktop notification failed:', error);
  }
}

/** True when the user is not looking at the session right now (tab hidden, window unfocused, or not in a pane on screen). */
function isAway(onScreen) {
  return document.hidden || !document.hasFocus() || !onScreen;
}

/**
 * Notifies about a session event through the channels the user chose.
 * @param {NotifyKind} kind
 * @param {{id:string, name:string}} session
 * @param {{onScreen:boolean, onOpen:(sessionId:string)=>void}} options onScreen: the session is shown in the main pane or
 *   the split pane; onOpen runs when a desktop notification is clicked
 */
export function notify(kind, session, { onScreen, onOpen }) {
  const preferences = notifyPreferences();
  if (!preferences[PREFERENCE_BY_KIND[kind]]) return;
  if (preferences.when === 'away' && !isAway(onScreen)) return;
  if (preferences.sound) playTone(kind, preferences.volume);
  if (preferences.desktop) showDesktop(kind, session, onOpen);
}

/** A sample of one kind through the chosen channels, for the settings panel (ignores the event and "when" choices). */
export function testNotification(kind) {
  const preferences = notifyPreferences();
  if (preferences.sound) playTone(kind, preferences.volume);
  if (preferences.desktop) showDesktop(kind, null, () => {});
}
