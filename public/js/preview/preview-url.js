/**
 * Pure helpers of the Preview pane (no DOM; also loaded by the unit tests): which local URLs it may frame, which files it
 * can show, and the preview route's URL of a file.
 */

const HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const DEFAULT_PORTS = { 'http:': '80', 'https:': '443' };
const KINDS = { html: ['html', 'htm'], image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'], pdf: ['pdf'] };

/**
 * Checks an address typed into the pane. Only http(s) on this machine, spelled exactly localhost / 127.0.0.1 / [::1]
 * (no decimal, hex or short IPv4 forms, no trailing dot, no credentials), and never the GUI's own port: a page there
 * would be the GUI's origin, and the API has no authentication.
 * @param {string} text what the user typed
 * @param {string|number} ownPort the GUI's port (location.port)
 * @returns {{url:string}|{error:string}} url: the normalized address to frame
 */
export function checkLocalUrl(text, ownPort) {
  const raw = String(text ?? '').trim();
  if (!raw) return { error: 'הקלד כתובת, למשל http://localhost:3000' };
  if (/[\u0000- \u007f\\]/.test(raw)) return { error: 'הכתובת מכילה תווים לא חוקיים' };
  const head = raw.match(/^(https?):\/\/([^/?#]*)/i);
  if (!head) return { error: 'רק כתובות http:// או https:// של המחשב הזה (localhost) נתמכות' };
  const authority = head[2];
  if (authority.includes('@')) return { error: 'כתובת עם שם משתמש או סיסמה לא נתמכת' };
  const spelled = authority.match(/^(\[[^\]]*\]|[^:]*)(?::(\d{1,5}))?$/);
  if (!spelled || !HOSTS.includes(spelled[1].toLowerCase())) {
    return { error: 'אפשר להציג רק כתובות של המחשב הזה: localhost, 127.0.0.1 או [::1]' };
  }
  let url;
  try { url = new URL(raw); } catch { return { error: 'כתובת לא תקינה' }; }
  if (!DEFAULT_PORTS[url.protocol] || !HOSTS.includes(url.hostname) || url.username || url.password) return { error: 'כתובת לא תקינה' };
  const port = url.port || DEFAULT_PORTS[url.protocol];
  if (port === '0') return { error: 'פורט לא תקין' };
  if (port === String(ownPort)) return { error: 'זו הכתובת של הממשק עצמו. אי אפשר להציג אותו בתצוגה המקדימה.' };
  return { url: url.href };
}

/** @param {string} path a file name or path @returns {'html'|'image'|'pdf'|null} how the pane shows it, or null */
export function previewKind(path) {
  const extension = (String(path || '').match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  return Object.keys(KINDS).find(kind => KINDS[kind].includes(extension)) || null;
}

const flat = text => String(text || '').replace(/\\/g, '/').replace(/\/+$/, '');

/**
 * The preview route's URL of a file of a session: the root it is in (0 = the session folder, 1.. = its extra folders)
 * and the path relative to it, each segment encoded. The server checks everything again.
 * @param {{id:string, cwd:string, addDirs?:string[]}} session @param {string} path absolute, or relative to the session folder
 * @returns {string|null} null: an absolute path outside the session's folders
 */
export function previewSrc(session, path) {
  const target = flat(path);
  let index = 0;
  let relative = target;
  if (/^([a-z]:|\/)/i.test(target)) {
    const roots = [session.cwd, ...(session.addDirs || [])].map(flat);
    index = roots.findIndex(root => root && `${target.toLowerCase()}/`.startsWith(`${root.toLowerCase()}/`) && target.length > root.length);
    if (index === -1) return null;
    relative = target.slice(roots[index].length + 1);
  }
  const segments = relative.split('/').filter(segment => segment && segment !== '.');
  if (segments.includes('..')) return null; // the browser would fold it out of the route
  const encoded = segments.map(encodeURIComponent).join('/');
  return encoded ? `/api/sessions/${encodeURIComponent(session.id)}/preview/${index}/${encoded}` : null;
}
