const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

/** Serves a file from public/. Rejects paths that escape that folder. */
function serveStatic(request, response) {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/favicon.ico') {
    response.writeHead(302, { Location: '/icon.svg' });
    return response.end();
  }
  const filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    response.writeHead(403);
    return response.end();
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      return response.end('Not found');
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(data);
  });
}

module.exports = { serveStatic };
