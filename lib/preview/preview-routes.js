/**
 * The Preview pane's only route: GET /api/sessions/:id/preview/:root/<relative path>, read-only raw bytes of a static
 * file of the session. Every response (errors and other methods too) carries the sandbox CSP of preview-headers.js, so
 * nothing this route returns ever runs with the GUI's origin. Served before the JSON routes (like /api/images).
 */
const fs = require('fs');
const { requireSession, requireRunnable } = require('../session-common');
const { httpError } = require('../http-utils');
const { previewHeaders } = require('./preview-headers');
const { resolvePreviewFile } = require('./preview-file');

const PREVIEW_PATH = /^\/api\/sessions\/([\w-]+)\/preview(?:\/|$)/;
const PREVIEW_FILE = /^\/api\/sessions\/([\w-]+)\/preview\/(\d{1,3})\/(.+)$/;

/** @param {string} pathname @returns {boolean} the URL belongs to the preview route (whatever the method) */
const isPreviewPath = pathname => PREVIEW_PATH.test(pathname);

const FRAME_DESTINATIONS = ['iframe', 'frame', 'embed', 'object'];

/**
 * True for an API request (other than the preview route) that loads into a frame. The GUI never frames its own API; a
 * previewed page that navigates its own (sandboxed) frame to e.g. /api/catalog?cwd= does, and that GET may start work.
 * @param {import('http').IncomingMessage} request @param {string} pathname
 */
const isFramedApiRequest = (request, pathname) => !isPreviewPath(pathname) && FRAME_DESTINATIONS.includes(request.headers['sec-fetch-dest']);

/**
 * A refusal with the preview headers (plain text, never HTML).
 * @param {import('http').ServerResponse} response @param {number} status @param {string} message
 * @param {string|null} [host] @param {string|null} [sessionId]
 */
function sendPreviewError(response, status, message, host = null, sessionId = null) {
  response.writeHead(status, previewHeaders(host, sessionId, 'text/plain; charset=utf-8'));
  response.end(message);
}

/**
 * Serves one preview request. Never throws: errors are answered here so they keep the headers.
 * @param {import('http').IncomingMessage} request @param {import('http').ServerResponse} response @param {string} pathname
 */
function servePreview(request, response, pathname) {
  const host = request.headers.host; // already one of the two allowed spellings (server.js guard)
  const sessionId = (pathname.match(PREVIEW_PATH) || [])[1] || null;
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') throw httpError(405, 'שיטה לא נתמכת');
    const match = pathname.match(PREVIEW_FILE);
    if (!match) throw httpError(404, 'נתיב תצוגה מקדימה לא תקין');
    const session = requireRunnable(requireSession(match[1]));
    const { real, size, contentType } = resolvePreviewFile(session, Number(match[2]), match[3]);
    const headers = { ...previewHeaders(host, sessionId, contentType), 'Content-Length': String(size) };
    if (contentType === 'application/pdf') headers['Content-Disposition'] = 'inline';
    response.writeHead(200, headers);
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(real).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    sendPreviewError(response, error.status || 500, error.status ? error.message : 'שגיאה בקריאת הקובץ', host, sessionId);
  }
}

module.exports = { isPreviewPath, isFramedApiRequest, servePreview, sendPreviewError };
