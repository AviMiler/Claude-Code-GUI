/**
 * The Changes pane's "מיזוג לענף הפרויקט" row for a worktree session (the offline replacement for a PR). It only appears
 * for a worktree session; the server (lib/git/merge.js) enforces every rule, the disabled state just explains why.
 */
import { api } from '../api.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { confirmAndMerge } from '../worktree/merge-action.js';
import { noticeBox } from './commit-parts.js';
import { invalidateSessionFetches } from './session-fetch.js';

/** @param {{rerender:()=>void}} deps @returns {{element:(session:object)=>HTMLElement, sync:(session:object, key:string)=>void}} */
export function createMergeBox({ rerender }) {
  const boxes = new Map(); // session id -> { root, status, notice, busy, fetchedFor, loading }

  function boxFor(id) {
    if (!boxes.has(id)) boxes.set(id, { id, root: h('div', { class: 'commit-box', hidden: true }), status: null, notice: null, busy: false, fetchedFor: null, loading: false });
    return boxes.get(id);
  }

  function draw(box) {
    const { status } = box;
    box.root.hidden = !status?.isWorktree;
    if (box.root.hidden) return;
    const tip = status.canMerge ? `git merge --no-ff של ${status.branch} אל ${status.target} בתיקיית הפרויקט` : status.reason;
    const button = h('button', { type: 'button', class: 'btn primary small', disabled: !status.canMerge || box.busy, title: tip, onClick: () => run(box) },
      icon('branch'), 'מיזוג לענף הפרויקט');
    const hint = status.canMerge ? `${status.ahead} commits למיזוג אל ${status.target}` : status.reason;
    box.root.replaceChildren(h('div', { class: 'commit-actions' }, button, h('span', { class: 'detail-muted' }, hint)), ...[noticeBox(box.notice)].filter(Boolean));
  }

  function load(box) {
    if (box.loading) return;
    box.loading = true;
    api.mergeStatus(box.id).then(status => { box.status = status; }).catch(() => { box.status = null; })
      .finally(() => { box.loading = false; draw(box); });
  }

  async function run(box) {
    if (box.busy || !box.status?.canMerge) return;
    box.busy = true;
    draw(box);
    const notice = await confirmAndMerge(box.id, box.status);
    box.busy = false;
    if (notice) box.notice = notice;
    invalidateSessionFetches(box.id);
    load(box);
    draw(box);
    if (notice) rerender();
  }

  return {
    element: session => boxFor(session.id).root,
    sync(session, key) {
      if (!session.worktree) return;
      const box = boxFor(session.id);
      const fetchKey = `${session.status}|${key}`;
      if (box.fetchedFor === fetchKey) return;
      box.fetchedFor = fetchKey;
      load(box);
    },
  };
}
