/**
 * The address of one session: `<page>#session=<id>`. Kept free of the DOM so it can be unit tested; session-link.js
 * copies it and opens what it names.
 */

const PREFIX = '#session=';

/** @param {string} hash @returns {boolean} the address is a session link (even one whose id cannot be read) */
export const isSessionHash = hash => typeof hash === 'string' && hash.startsWith(PREFIX);

/**
 * @param {string} hash the address's hash (`location.hash`)
 * @returns {string|null} the session id it names, or null when it names none (or cannot be decoded)
 * @example sessionFromHash('#session=abc%201') // 'abc 1'
 */
export function sessionFromHash(hash) {
  if (!isSessionHash(hash)) return null;
  try {
    const id = decodeURIComponent(hash.slice(PREFIX.length)).trim();
    return id || null;
  } catch {
    return null; // a broken %-escape
  }
}

/**
 * @param {{origin:string, pathname:string}} page where the GUI runs (`location`) @param {string} id the session's id
 * @returns {string} the session's address
 * @example sessionLink({ origin: 'http://127.0.0.1:3737', pathname: '/' }, 'abc') // 'http://127.0.0.1:3737/#session=abc'
 */
export const sessionLink = (page, id) => `${page.origin}${page.pathname}${PREFIX}${encodeURIComponent(id)}`;
