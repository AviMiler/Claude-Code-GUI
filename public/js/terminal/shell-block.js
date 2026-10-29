/** One shell command as a block: the command, its output, and how it ended. Used by the Terminal pane and the `!` cards. */
import { h } from '../dom.js';
import { icon } from '../icons.js';

/** @param {{exitCode?:number|null, stopped?:boolean, running?:boolean, truncated?:boolean, error?:string|null}} run */
export function statusOf(run) {
  if (run.running) return { text: 'רץ…', tone: 'running' };
  if (run.error) return { text: `לא ניתן להריץ: ${run.error}`, tone: 'error' };
  if (run.stopped) return { text: 'נעצר', tone: 'error' };
  const note = run.truncated ? ' · הפלט נחתך' : '';
  return run.exitCode === 0 ? { text: `הסתיים${note}`, tone: 'ok' } : { text: `קוד יציאה ${run.exitCode ?? '?'}${note}`, tone: 'error' };
}

/**
 * @param {object} run a ShellRun (shell-store.js) or a saved `shell` item
 * @param {{onStop?:()=>void}} [handlers] onStop: shows the stop button while the command runs
 * @returns {HTMLElement & {update:(run:object)=>void}} update draws the run again (new output, the end)
 */
export function shellBlock(run, { onStop } = {}) {
  const command = h('code', { class: 'shell-command', dir: 'ltr' });
  const out = h('pre', { class: 'shell-out', dir: 'ltr' });
  const err = h('pre', { class: 'shell-err', dir: 'ltr' });
  const status = h('span', { class: 'shell-status' });
  const stop = onStop ? h('button', { type: 'button', class: 'btn small', title: 'עצירת הפקודה', onClick: onStop }, icon('stop'), 'עצירה') : null;
  const node = h('div', { class: 'shell-run' }, h('div', { class: 'shell-head' }, h('span', { class: 'shell-prompt', 'aria-hidden': 'true' }, '$'), command), out, err,
    h('div', { class: 'shell-foot' }, status, stop));
  node.update = next => {
    command.textContent = next.command;
    out.textContent = next.stdout || '';
    err.textContent = next.stderr || '';
    out.hidden = !next.stdout;
    err.hidden = !next.stderr;
    const { text, tone } = statusOf(next);
    status.textContent = text;
    node.dataset.tone = tone;
    if (stop) stop.hidden = !next.running;
  };
  node.update(run);
  return node;
}
