/**
 * Preview pane: a passive look at a project file (HTML, image, PDF) or a local page (http://localhost:<port>). Claude does
 * not see or drive it. It follows the main session; switching sessions clears it. No live reload: a reload button.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { checkLocalUrl, previewKind, previewSrc } from './preview-url.js';
import { previewNode } from './preview-view.js';
import { registerPreviewOpener } from './open-preview.js';

const ISOLATED = 'הדף רץ מבודד: בלי גישה לממשק, לרשת, לחלונות קופצים או לאחסון. גופנים וסקריפטים מסוג module לא נטענים.';

/**
 * @param {{rerender:()=>void, openPane:(id:string)=>void}} deps
 * @returns {import('../panes/pane-host.js').PaneDefinition}
 */
export function createPreviewPane({ rerender, openPane }) {
  let session = null;
  let target = null; // { sessionId, kind, src, label }
  let wanted = null; // { sessionId, path }: a file another part of the page asked to show
  let error = '';
  let round = 0;
  let drawn = null; // what the view shows now: `${src}|${round}`
  const address = h('input', { type: 'text', class: 'preview-address', dir: 'ltr', spellcheck: false, placeholder: 'http://localhost:3000',
    'aria-label': 'כתובת מקומית לתצוגה מקדימה' });
  const form = h('form', { class: 'preview-form', onSubmit: event => { event.preventDefault(); showUrl(address.value); } }, address,
    h('button', { type: 'submit', class: 'btn small' }, 'הצגה'));
  const label = h('code', { class: 'preview-label', dir: 'ltr' });
  const reload = h('button', { type: 'button', class: 'icon-button', title: 'טעינה מחדש', onClick: () => { round += 1; draw(); } }, icon('refresh'));
  const external = h('a', { class: 'icon-button', target: '_blank', rel: 'noopener noreferrer', title: 'פתיחה בכרטיסייה חדשה בדפדפן' }, icon('external'));
  const notes = h('div', { class: 'preview-notes' });
  const view = h('div', { class: 'preview-view' });
  const node = h('div', { class: 'preview-pane' }, form, h('div', { class: 'preview-bar' }, label, reload, external), notes, view);

  function showUrl(text) {
    const checked = checkLocalUrl(text, location.port || (location.protocol === 'https:' ? '443' : '80'));
    if (checked.error) { error = checked.error; draw(); return; }
    error = '';
    target = { sessionId: session.id, kind: 'url', src: checked.url, label: checked.url };
    address.value = checked.url;
    draw();
  }

  function showFile(path) {
    const src = previewSrc(session, path);
    const kind = previewKind(path);
    error = src && kind ? '' : 'הקובץ מחוץ לתיקיות של הסשן או מסוג שלא מוצג כאן';
    if (!error) target = { sessionId: session.id, kind, src, label: path };
    draw();
  }

  function draw() {
    const shown = target && target.sessionId === session?.id ? target : null;
    label.textContent = shown ? shown.label : 'אין תצוגה מקדימה';
    label.title = shown ? shown.label : '';
    reload.disabled = !shown;
    external.style.display = shown?.kind === 'url' ? '' : 'none'; // localhost addresses only, never a project file
    if (shown?.kind === 'url') external.href = shown.src; else external.removeAttribute('href');
    notes.replaceChildren(...[
      error && h('div', { class: 'editor-note conflict', role: 'alert' }, error),
      shown?.kind === 'html' && h('div', { class: 'editor-note preview-isolated' }, ISOLATED),
    ].filter(Boolean));
    const key = shown ? `${shown.src}|${round}` : '';
    if (key === drawn) return;
    drawn = key;
    view.replaceChildren(shown ? previewNode(shown, round)
      : h('p', { class: 'detail-muted' }, 'בחר "תצוגה מקדימה" בתפריט של קובץ HTML, תמונה או PDF, או הקלד למעלה כתובת מקומית כמו http://localhost:3000.'));
  }

  registerPreviewOpener((sessionId, path) => { wanted = { sessionId, path }; openPane('preview'); rerender(); });

  return {
    id: 'preview', title: 'תצוגה מקדימה', icon: 'globe',
    render(body, current) {
      if (session && session.id !== current.id) { target = null; error = ''; } // the preview belongs to the session it was opened for
      session = current;
      if (!body.contains(node)) body.replaceChildren(node);
      if (wanted?.sessionId === current.id) { const { path } = wanted; wanted = null; showFile(path); return; }
      draw();
    },
  };
}
