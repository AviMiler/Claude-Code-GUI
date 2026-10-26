/** Tiny DOM helpers shared by every view. */

/**
 * Creates an element. Props: class, dataset, on<Event> listeners, html (trusted markup only), any attribute or property.
 * @param {string} tag
 * @param {object|null} [props]
 * @param {...(Node|string|null|false|Array)} children
 * @returns {HTMLElement}
 * @example h('button', { class: 'btn', onClick: save }, icon('check'), 'שמירה')
 */
export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'html') node.innerHTML = value;
    else if (/^on[A-Z]/.test(key)) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));
  return node;
}

/** Last segment of a Windows or POSIX path. */
export function folderName(cwd) {
  return String(cwd || '').split(/[\\/]/).filter(Boolean).pop() || cwd || '';
}

/** Short relative time in Hebrew. */
export function timeAgo(timestamp) {
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'עכשיו';
  if (seconds < 3600) return `לפני ${Math.round(seconds / 60)} דק׳`;
  if (seconds < 86400) return `לפני ${Math.round(seconds / 3600)} שע׳`;
  return new Date(timestamp).toLocaleDateString('he-IL');
}

export function formatTokens(count) {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

/** Copies text; falls back to a hidden textarea when the async clipboard API is blocked. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = h('textarea', { style: 'position:fixed;opacity:0' }, text);
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

/** Triggers a download of a text file. */
export function downloadText(filename, text, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = h('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
