/**
 * The element that shows a preview target. Security rules (project files are untrusted, the API has no authentication):
 * - a project HTML file runs in an iframe with sandbox="allow-scripts" only (opaque origin; no same-origin, popups, forms,
 *   modals or top navigation), and the server adds a sandbox CSP that also blocks its network access;
 * - an image (SVG included) is an <img>, so a script inside an SVG never runs;
 * - a localhost address (never the GUI's own port: preview-url.js) may keep its own origin, since that origin is not ours;
 * - the page never reads from or posts to a frame (no contentWindow access, no message listener).
 */
import { h } from '../dom.js';

const FILE_SANDBOX = 'allow-scripts';
const LOCAL_SANDBOX = 'allow-scripts allow-forms allow-same-origin';

const frame = (src, sandbox, title) => h('iframe', { class: 'preview-frame', src, sandbox, referrerpolicy: 'no-referrer', title,
  allow: '', loading: 'eager' });

/**
 * @param {{kind:'html'|'image'|'pdf'|'url', src:string, label:string}} target src: the preview route URL or the local address
 * @param {number} round bumps on "reload" so the browser asks again (the route ignores the query)
 * @returns {HTMLElement}
 */
export function previewNode(target, round) {
  const src = target.kind === 'url' ? target.src : `${target.src}?r=${round}`;
  if (target.kind === 'url') return frame(src, LOCAL_SANDBOX, target.label);
  if (target.kind === 'html') return frame(src, FILE_SANDBOX, target.label);
  if (target.kind === 'image') return h('div', { class: 'preview-image' }, h('img', { src, alt: target.label, referrerpolicy: 'no-referrer' }));
  // PDF: Chromium's viewer does not run inside a sandbox (frame or CSP), and the file is never shown unsandboxed here.
  return h('div', { class: 'preview-note' },
    h('p', null, 'הדפדפן לא מציג PDF בתוך מסגרת מבודדת, ולכן הוא לא מוצג כאן.'),
    h('a', { class: 'btn small', href: src, target: '_blank', rel: 'noopener noreferrer' }, 'פתיחה בכרטיסייה חדשה'));
}
