/**
 * Headers of every response of the preview route (lib/preview/preview-routes.js), errors included. Project files are
 * untrusted: the document runs sandboxed (an opaque origin, even when the URL is opened directly in a tab), and its
 * subresources may come only from the session's own preview prefix, never from the rest of the GUI's API.
 */

/** Static types the route serves; anything else is refused. */
const PREVIEW_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

/**
 * The Content-Security-Policy of a preview response.
 * Why a path-scoped source and not 'self': 'self' would also allow <img src="/api/..."> GETs to every other API route
 * (some start processes); a source with a path ending in "/" matches only that prefix. The host is the request's own Host,
 * which the guard in server.js has already limited to 127.0.0.1:<port> / localhost:<port>.
 * @param {string|null} host the checked Host header, or null (then nothing may load)
 * @param {string|null} sessionId
 * @returns {string}
 */
function previewPolicy(host, sessionId) {
  const own = host && sessionId ? `http://${host}/api/sessions/${sessionId}/preview/` : "'none'";
  return [
    'sandbox allow-scripts', // opaque origin: no cookies, storage or same-origin reads, no popups, forms, top navigation
    "default-src 'none'",
    `img-src ${own} data: blob:`,
    `style-src ${own} 'unsafe-inline'`,
    `script-src ${own} 'unsafe-inline'`,
    `media-src ${own}`,
    "connect-src 'none'", // fetch, XHR, EventSource, WebSocket, sendBeacon
    "form-action 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "manifest-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/**
 * @param {string|null} host @param {string|null} sessionId @param {string} contentType
 * @returns {Record<string,string>}
 */
function previewHeaders(host, sessionId, contentType) {
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': previewPolicy(host, sessionId),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
}

module.exports = { PREVIEW_TYPES, previewPolicy, previewHeaders };
