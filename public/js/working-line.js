/**
 * The "working" line under a running turn: Claude's crab in the current state (data-state, animated in
 * css/animations.css), a verb, and the elapsed time; a short "done" / "error" / "stopped" moment when the turn ends.
 * States: starting (the CLI is starting up) · thinking · writing · tool · waiting (for the user's approval).
 */
import { h } from './dom.js';
import { crab, setCrabState } from './crab.js';
import { toolMeta } from './render-tools.js';

const VERBS = ['חושב', 'מעבד', 'מתכנן', 'בודק', 'מנתח', 'מגבש', 'מהרהר', 'מבשל רעיון'];
const END_MOMENT_MS = 2200;
const END_TEXTS = { error: 'משהו השתבש', stopped: 'נעצר' };

/** Plays a CSS animation class again from its start. */
function restartAnimation(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

/**
 * @param {() => {writing:boolean, thinking:boolean, tool:object|null, heard:boolean}} activity what the thread sees now:
 *   streaming text / thinking, the open tool call, and whether anything arrived from the CLI in this turn
 * @returns {{node:()=>HTMLElement|null, start:(status:{startedAt:number, waiting:boolean})=>HTMLElement|null,
 *   render:()=>void, finish:(outcome:'done'|'error'|'stopped')=>void}} start returns the new element (null if it existed)
 */
export function createWorkingLine(activity) {
  let element = null;
  let tick = null;
  let status = { startedAt: 0, waiting: false };

  function currentState() {
    const now = activity();
    if (status.waiting) return { state: 'waiting', verb: 'ממתין לאישור שלך' };
    if (now.writing) return { state: 'writing', verb: 'כותב' };
    if (now.thinking) return { state: 'thinking', verb: 'חושב' };
    if (now.tool) {
      const meta = toolMeta(now.tool.name, now.tool.input || {});
      const target = String(meta.target(now.tool.input || {}) || '').split('\n')[0];
      return { state: 'tool', verb: target ? `${meta.verb} · ${target.length > 48 ? `${target.slice(0, 48)}…` : target}` : meta.verb };
    }
    if (!now.heard) return { state: 'starting', verb: 'מעיר את Claude Code' };
    return { state: 'thinking', verb: element.dataset.verb };
  }

  function render() {
    if (!element) return;
    const seconds = Math.floor((Date.now() - status.startedAt) / 1000);
    const { state, verb } = currentState();
    const verbNode = element.querySelector('.verb');
    if (element.dataset.state !== state) restartAnimation(verbNode, 'swap'); // the text slides in with the crab's new move
    element.dataset.state = state;
    setCrabState(element.querySelector('.crab'), state);
    verbNode.textContent = `${verb}…`;
    element.querySelector('.elapsed').textContent = `${seconds} שנ׳`;
  }

  function start(nextStatus) {
    status = nextStatus;
    let created = null;
    if (!element) {
      created = element = h('div', { class: 'working', dataset: { verb: VERBS[Math.floor(Math.random() * VERBS.length)], state: 'starting' } },
        crab(), h('span', { class: 'verb' }), h('span', { class: 'elapsed' }), h('kbd', null, 'Esc'));
      clearInterval(tick);
      tick = setInterval(render, 1000);
    }
    render();
    return created;
  }

  /** The crab stays a moment after the turn: a happy move when it finished, a scare when it failed. */
  function finish(outcome) {
    clearInterval(tick);
    if (element) {
      const node = element;
      node.dataset.state = outcome;
      restartAnimation(node.querySelector('.verb'), 'swap');
      setCrabState(node.querySelector('.crab'), outcome);
      node.querySelector('.verb').textContent = END_TEXTS[outcome] || 'סיים';
      node.querySelector('kbd')?.remove();
      node.classList.add('ending');
      setTimeout(() => node.remove(), END_MOMENT_MS);
    }
    element = null;
  }

  return { node: () => element, start, render, finish };
}
