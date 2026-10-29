/** The URL of an MCP elicitation: shown in full, and openable only when it is http(s). It never opens by itself. */
import { h } from '../dom.js';
import { icon } from '../icons.js';

/** @returns {boolean} the URL is a web address (anything else, such as javascript: or file:, is only shown) */
function isWebUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export function urlBlock(url) {
  const open = isWebUrl(url)
    ? h('button', { type: 'button', class: 'btn', onClick: () => window.open(url, '_blank', 'noopener,noreferrer') }, icon('external'), 'פתיחת הקישור')
    : h('span', { class: 'el-desc' }, 'הכתובת אינה כתובת אינטרנט תקינה, ולכן לא ניתן לפתוח אותה מכאן.');
  return h('div', { class: 'el-url' }, h('code', { dir: 'ltr' }, url), open);
}
