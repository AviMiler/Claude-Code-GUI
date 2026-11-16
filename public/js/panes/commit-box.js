/**
 * The Changes pane's commit box: a message, the files to commit (ticked) and "Commit" / "Commit ו-Push", plus a Push
 * of commits already made. One box per session; its element (and the half-typed message) outlives the pane's redraws.
 * Every rule is also enforced by the server (lib/git/commit.js); the disabled states here only explain, in Hebrew, why.
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { invalidateSessionFetches } from './session-fetch.js';
import { branchLine, fileList, noticeBox } from './commit-parts.js';

/** @param {{rerender:()=>void}} deps rerender: draws the panes again (the diff is fetched anew) @returns {{element:(session:object)=>HTMLElement, sync:(session:object, diffKey:string)=>void, reload:(session:object)=>void}} */
export function createCommitBox({ rerender }) {
  const boxes = new Map(); // session id -> box

  function boxFor(session) {
    let box = boxes.get(session.id);
    if (box) return box;
    const textarea = h('textarea', { class: 'commit-message', rows: 2, placeholder: 'הודעת commit: שורה ראשונה, ואחריה שורה ריקה ופירוט (אופציונלי)', 'aria-label': 'הודעת commit', onInput: () => update(box) });
    box = { id: session.id, session, data: null, unchecked: new Set(), notice: null, busy: false, loading: false, fetchedFor: null, textarea,
      root: h('div', { class: 'commit-box' }), dynamic: h('div'), buttons: h('div', { class: 'commit-actions' }) };
    box.root.append(box.dynamic, textarea, box.buttons);
    boxes.set(session.id, box);
    return box;
  }

  const chosen = box => (box.data?.files || []).filter(file => !box.unchecked.has(file.path));
  const text = box => box.textarea.value.trim();

  /** Why the commit button is off (Hebrew), or ''. */
  function commitBlock(box) {
    const { data } = box;
    if (!data) return 'טוען…';
    if (!data.isRepo) return '';
    if (!data.canCommit) return data.commitReason;
    if (!chosen(box).length) return 'לא נבחרו קבצים לשמירה.';
    return text(box) ? '' : 'כתוב הודעת commit.';
  }

  /** The buttons, from the current state: cheap, runs on every keystroke and tick. */
  function update(box) {
    const { data } = box;
    const block = commitBlock(box);
    const pushBlock = !data?.isRepo ? '' : data.upstream || data.canPushNewUpstream ? '' : data.pushReason;
    const button = (label, title, disabled, onClick, primary) => h('button', { type: 'button', class: `btn ${primary ? 'primary' : ''} small`, disabled: disabled || box.busy, title, onClick }, label);
    const withUpstream = data?.isRepo && !data.upstream && data.canPushNewUpstream;
    box.textarea.disabled = !data?.isRepo || !data.canCommit;
    box.buttons.replaceChildren(...[
      button('Commit', block || 'git commit בקבצים המסומנים (ה-hooks של המאגר רצים)', Boolean(block), () => run(box, false), true),
      button(withUpstream ? 'Commit ו-Push (ויצירת upstream)' : 'Commit ו-Push', block || pushBlock || 'commit ואז push', Boolean(block || pushBlock), () => run(box, true)),
      block ? h('span', { class: 'detail-muted' }, block) : (pushBlock ? h('span', { class: 'detail-muted' }, `Push: ${pushBlock}`) : null)].filter(Boolean));
  }

  function draw(box) {
    const { data, session } = box;
    box.root.hidden = !data || !data.isRepo;
    if (!data?.isRepo) return update(box);
    const warn = session.status === 'running' ? h('div', { class: 'commit-notice warn' }, 'Claude עדיין עובד וייתכן שהוא משנה קבצים. הרשימה למטה היא מרגע הטעינה.') : null;
    const files = data.files.length ? fileList(data.files, box.unchecked, () => update(box)) : null;
    const hints = [data.inProgress || !files ? data.commitReason : '', data.detached ? 'HEAD מנותק: אפשר לשמור commit, אי אפשר לדחוף.' : '', data.filesTruncated ? 'רשימת הקבצים קוצרה.' : '']
      .filter(Boolean).map(hint => h('p', { class: 'detail-muted' }, hint));
    box.dynamic.replaceChildren(branchLine(data, { busy: box.busy, onPush: () => push(box, false), onPushNew: () => push(box, true) }), ...[warn, ...hints, files, noticeBox(box.notice)].filter(Boolean));
    update(box);
  }

  function load(box) {
    if (box.loading) return;
    box.loading = true;
    api.commitStatus(box.id).then(data => { box.data = data; }).catch(error => { box.data = { isRepo: false, error: error.message }; })
      .finally(() => { box.loading = false; draw(box); });
  }

  /** After a try: the repository changed (or git refused): fetch the status and the diff again. */
  function finish(box, notice) {
    box.busy = false;
    box.notice = notice;
    invalidateSessionFetches(box.id);
    load(box);
    draw(box);
    rerender();
  }

  async function run(box, withPush) {
    if (box.busy || commitBlock(box)) return;
    box.busy = true;
    box.notice = null;
    draw(box);
    try {
      const result = await api.commitChanges(box.id, { message: box.textarea.value, paths: chosen(box).map(file => file.path), push: withPush, setUpstream: withPush && !box.data.upstream });
      box.textarea.value = '';
      box.unchecked.clear();
      const pushNote = result.pushed ? ' ונדחף.' : result.pushError ? ` אבל הדחיפה נכשלה: ${result.pushError}` : '';
      finish(box, { type: result.pushError ? 'warn' : 'ok', text: `נשמר commit ${result.hash}${result.branch ? ` בענף ${result.branch}` : ''}.${pushNote}` });
    } catch (error) { // git refused: the message stays for another try
      finish(box, { type: 'error', text: error.message });
    }
  }

  async function push(box, setUpstream) {
    if (box.busy) return;
    box.busy = true;
    box.notice = null;
    draw(box);
    try {
      const result = await api.pushBranch(box.id, { setUpstream });
      finish(box, { type: 'ok', text: result.setUpstream ? 'הענף נדחף וה-upstream נוצר.' : 'הדחיפה הושלמה.' });
    } catch (error) {
      finish(box, { type: 'error', text: error.message });
    }
  }

  return {
    element: session => { const box = boxFor(session); box.session = session; return box.root; },
    /** Fetches the status when the session's status or the diff changed since the last time. */
    sync(session, diffKey) {
      const box = boxFor(session);
      box.session = session;
      const key = `${session.status}|${diffKey}`;
      if (box.fetchedFor === key) return;
      box.fetchedFor = key;
      load(box);
    },
    reload: session => load(boxFor(session)),
  };
}
