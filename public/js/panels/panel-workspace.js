/** /diff (uncommitted git changes) and /resume (past CLI conversations of this folder). */
import { h, timeAgo } from '../dom.js';
import { renderDiff } from '../render-tools.js';
import { section, list, row, badge, button, load, empty, loading, errorBox } from './kit.js';

function parseUnifiedDiff(text) {
  return text.split('\n').map(line => {
    if (line.startsWith('diff --git')) return { type: 'file', text: line.replace(/^diff --git a\/(.*) b\/.*$/, '$1') };
    if (line.startsWith('@@')) return { type: 'hunk', text: line };
    if (/^(index |--- |\+\+\+ )/.test(line)) return null;
    if (line.startsWith('+')) return { type: 'add', text: line.slice(1) };
    if (line.startsWith('-')) return { type: 'del', text: line.slice(1) };
    return { type: 'ctx', text: line.slice(1) };
  }).filter(Boolean);
}

export function renderDiffPanel(body, context) {
  const box = h('div');
  body.append(h('div', { class: 'panel-toolbar' }, button('רענון', () => context.rerender(), { iconName: 'refresh' })), box);
  load(box, () => context.api.git(context.scope), changes => {
    if (!changes.isRepo) return empty(`התיקייה אינה מאגר git. ${changes.error || ''}`);
    if (!changes.files.length) return [section(`ענף: ${changes.branch}`, null), empty('אין שינויים שלא נשמרו ✓')];
    return [
      section(`ענף: ${changes.branch}`, `${changes.files.length} קבצים השתנו`,
        list(changes.files.map(file => row({ title: h('code', { dir: 'ltr' }, file.path), badges: [badge(file.status || '?', /D/.test(file.status) ? 'danger' : /\?|A/.test(file.status) ? 'success' : 'info')] })))),
      section('השינויים', changes.truncated ? 'התצוגה קוצרה – השינוי גדול מדי.' : null, renderDiff(parseUnifiedDiff(changes.diff))),
    ];
  });
}

export function renderResumePanel(body, context) {
  const box = h('div');
  const search = h('input', { type: 'search', placeholder: 'חיפוש בשיחות…' });
  body.append(section('שיחות קודמות בתיקייה', 'כל שיחה שנוהלה ב-Claude Code בתיקייה הזו – גם מהטרמינל. פתיחה ממשיכה אותה עם --resume.',
    h('div', { class: 'panel-toolbar' }, search), box));
  let all = [];
  const draw = () => {
    const needle = search.value.trim().toLowerCase();
    const items = all.filter(item => !needle || item.title.toLowerCase().includes(needle));
    const open = context.openSessionIds();
    box.replaceChildren(items.length ? list(items.map(item => row({
      title: item.title, badges: open.has(item.id) ? [badge('פתוח בממשק', 'accent')] : [],
      sub: `${timeAgo(item.updatedAt)} · ${Math.max(1, Math.round(item.sizeBytes / 1024))} KB · ${item.id.slice(0, 8)}`,
      actions: [button('המשך', async () => {
        const session = await context.api.importTranscript(context.folder, item.id, context.draft.mode);
        context.close();
        context.selectSession(session);
      }, { variant: 'primary', iconName: 'history' })],
    }))) : empty(needle ? 'אין שיחות תואמות' : 'לא נמצאו שיחות קודמות לתיקייה הזו'));
  };
  search.addEventListener('input', draw);
  box.replaceChildren(loading());
  context.api.transcripts({ cwd: context.folder })
    .then(items => { all = items; draw(); })
    .catch(error => box.replaceChildren(errorBox(error)));
}
