/**
 * Early warning above the main composer: when the context crosses config.contextWarnPercent (default 70) a calm card
 * appears ONCE per crossing (it stays until dismissed or acted on, and comes back only after the context fell below the
 * level and crossed it again). Actions: /compact (the CLI's own) and "סכם ונקה" (summarize-clear.js). Not a desktop
 * notification; the split pane has none.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { formatTokens } from '../dom.js';
import { contextInfo } from './context-info.js';
import { summarizeAndClear } from './summarize-clear.js';

/**
 * @param {{actions:object, putDraft:(text:string)=>void}} deps actions.js; putDraft fills the composer without sending
 * @returns {{node:HTMLElement, update:(session:object|null)=>void}}
 */
export function createContextWarning({ actions, putDraft }) {
  const node = h('div', { class: 'context-warning', role: 'status', hidden: true });
  const marks = new Map(); // sessionId -> { above, dismissed }
  let shownFor = null;
  let flow = null; // { sessionId, controller } while "סכם ונקה" waits for the summary

  const button = (label, onClick, variant = '') => h('button', { type: 'button', class: `btn small ${variant}`, onClick }, label);
  const dismiss = id => { marks.set(id, { above: true, dismissed: true }); node.hidden = true; shownFor = null; };

  function draw(session, info) {
    node.classList.toggle('is-over', info.percent > 100);
    if (flow?.sessionId === session.id) {
      node.replaceChildren(icon('loader', 'spinning'), h('span', { class: 'context-warning-text' }, 'Claude כותב סיכום של השיחה. בסיומו ההקשר ינוקה והסיכום יחכה בתיבת הכתיבה.'),
        h('span', { class: 'context-warning-actions' }, button('ביטול', () => { flow.controller.abort(); actions.stop(); })));
      return;
    }
    const text = `ההקשר מלא ב-${info.isEstimate ? '≈' : ''}${info.percent}% (${formatTokens(info.tokens)} מתוך ${formatTokens(info.window)} טוקנים). `
      + 'כשהוא מתמלא המודל מתחיל לשכוח את תחילת השיחה.';
    node.replaceChildren(icon('gauge'), h('span', { class: 'context-warning-text' }, text),
      h('span', { class: 'context-warning-actions' },
        button('דחיסה (/compact)', () => { dismiss(session.id); actions.send('/compact'); }, 'primary'),
        button('סכם ונקה', () => startSummary(session))),
      h('button', { type: 'button', class: 'icon-button', title: 'סגירה', 'aria-label': 'סגירה', onClick: () => dismiss(session.id) }, icon('x')));
  }

  async function startSummary(session) {
    const controller = new AbortController();
    const result = await summarizeAndClear({ session, actions, putDraft, signal: controller.signal,
      onWaiting: () => { flow = { sessionId: session.id, controller }; update(session); } });
    flow = null;
    if (result !== 'declined') dismiss(session.id);
  }

  function update(session) {
    const info = session && contextInfo(session);
    if (!session || !info || !info.windowKnown) { if (!flow) { node.hidden = true; shownFor = null; } return; }
    const mark = marks.get(session.id) || { above: false, dismissed: false };
    const above = info.percent >= info.warnPercent;
    if (!above) marks.set(session.id, { above: false, dismissed: false });
    else if (!mark.above) marks.set(session.id, { above: true, dismissed: false }); // a crossing: show once
    const show = flow?.sessionId === session.id || (above && !marks.get(session.id).dismissed);
    node.hidden = !show;
    if (!show) { shownFor = null; return; }
    // Rebuilt only when it first shows or its numbers change, never on every redraw (a focused button would be lost).
    const key = `${session.id}|${info.percent}|${info.tokens}|${flow?.sessionId || ''}`;
    if (key !== shownFor) { shownFor = key; draw(session, info); }
  }

  return { node, update };
}
