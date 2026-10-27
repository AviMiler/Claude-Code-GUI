/**
 * The model server's health dot in the sidebar footer: green up, red down, grey unknown (Anthropic's own servers are
 * never pinged). Checks on load, every minute while the tab is visible, right after a turn fails, and on a click.
 */
import { api } from './api.js';
import { toast } from './ui.js';

const POLL_MS = 60000;
const LABELS = { up: 'שרת המודל זמין', down: 'שרת המודל לא זמין', unknown: 'אין בדיקה (שרתי Anthropic)', checking: 'בודק…' };

function describe(health) {
  return [LABELS[health.state] || LABELS.unknown, health.url, health.latencyMs !== null ? `${health.latencyMs} ms` : '', health.error || '',
    health.checkedAt ? `נבדק ב-${new Date(health.checkedAt).toLocaleTimeString('he-IL')}` : ''].filter(Boolean).join('\n');
}

/**
 * @param {HTMLButtonElement} dot the indicator (data-state drives its color in layout.css)
 * @returns {{check:(options?:{refresh?:boolean, announce?:boolean})=>Promise<void>, afterFailedTurn:()=>void}}
 * @example const health = createModelHealth(document.getElementById('model-health'));
 */
export function createModelHealth(dot) {
  let inFlight = null; // one request at a time: polls never overlap

  async function check({ refresh = false, announce = false } = {}) {
    if (inFlight) return inFlight;
    if (announce) { dot.dataset.state = 'checking'; dot.title = LABELS.checking; }
    inFlight = api.modelHealth(refresh).then(health => {
      dot.dataset.state = health.state;
      dot.title = describe(health);
      dot.setAttribute('aria-label', LABELS[health.state] || LABELS.unknown);
      if (announce) toast(describe(health).split('\n').slice(0, 1).concat(health.error || []).join(' – '), health.state === 'down' ? 'error' : 'info');
    }).catch(error => {
      // The GUI server itself did not answer (e.g. stopped): say nothing about the model server.
      console.error('[model-health] check failed:', error);
      dot.dataset.state = 'unknown';
      dot.title = `${LABELS.unknown}\n${error.message}`;
    }).finally(() => { inFlight = null; });
    return inFlight;
  }

  dot.addEventListener('click', () => check({ refresh: true, announce: true }));
  setInterval(() => { if (!document.hidden) check(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  check();

  return {
    check,
    /** A failed turn: was it the model server? Look now instead of waiting for the next poll. */
    afterFailedTurn: () => check({ refresh: true }),
  };
}
