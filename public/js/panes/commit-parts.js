/** Pieces of the Changes pane's commit box that only draw: the branch line, the file checkboxes and the result notice. */
import { h } from '../dom.js';
import { icon } from '../icons.js';

/** @param {object} data a commit status (lib/git/commit-status.js) @param {{onPush:()=>void, onPushNew:()=>void, busy:boolean}} actions @returns {HTMLElement} */
export function branchLine(data, { onPush, onPushNew, busy }) {
  const ahead = data.ahead ? `${data.ahead} commits לפני ${data.upstream}` : data.upstream ? `מעודכן מול ${data.upstream}` : '';
  return h('div', { class: 'commit-branch' }, icon('branch'),
    h('strong', { dir: 'ltr' }, data.detached ? 'HEAD מנותק' : data.branch || '(ללא commit)'),
    ahead ? h('span', { class: 'detail-muted' }, ahead) : null,
    h('span', { class: 'spacer' }),
    data.canPush ? h('button', { type: 'button', class: 'btn ghost small', disabled: busy, onClick: onPush, title: 'git push (בלי כוח)' }, icon('arrow-up'), 'Push') : null,
    !data.upstream && data.canPushNewUpstream
      ? h('button', { type: 'button', class: 'btn ghost small', disabled: busy, onClick: onPushNew, title: 'git push -u origin ' + data.branch }, icon('arrow-up'), 'push ויצירת upstream') : null);
}

/**
 * @param {{path:string, oldPath?:string, status:string, untracked:boolean}[]} files
 * @param {Set<string>} unchecked paths the user unticked (all others are ticked)
 * @param {()=>void} onChange a box was clicked (the buttons re-evaluate)
 * @returns {HTMLElement}
 */
export function fileList(files, unchecked, onChange) {
  const rows = files.map(file => h('label', { class: 'commit-file' },
    h('input', { type: 'checkbox', checked: !unchecked.has(file.path), onChange: event => { event.target.checked ? unchecked.delete(file.path) : unchecked.add(file.path); onChange(); } }),
    h('span', { class: `badge ${file.untracked ? 'info' : ''}` }, file.status),
    h('span', { class: 'commit-file-path', dir: 'ltr', title: file.path }, file.oldPath ? `${file.oldPath} → ${file.path}` : file.path)));
  const toggle = h('button', { type: 'button', class: 'btn ghost small', onClick: () => {
    const all = unchecked.size === 0;
    files.forEach(file => (all ? unchecked.add(file.path) : unchecked.delete(file.path)));
    rows.forEach(row => { row.querySelector('input').checked = !all; });
    onChange();
  } }, 'בחירת הכל / ניקוי');
  return h('div', null, h('div', { class: 'commit-files-head' }, h('span', null, `${files.length} קבצים לשמירה`), h('span', { class: 'spacer' }), toggle),
    h('div', { class: 'commit-files' }, rows));
}

/** @param {{type:'ok'|'warn'|'error', text:string}|null} notice @returns {HTMLElement|null} */
export function noticeBox(notice) {
  if (!notice) return null;
  return h('div', { class: notice.type === 'error' ? 'error-box' : `commit-notice ${notice.type}`, role: 'status' }, notice.text);
}
