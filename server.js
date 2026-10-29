/**
 * Entry point. Starts the local HTTP server that serves the GUI (public/) and the API (lib/api-routes.js).
 * Wires: config -> request guard -> API routes or static files.
 */
const http = require('http');
const { loadConfig } = require('./lib/config');
const { isAllowedRequest, sendJson } = require('./lib/http-utils');
const { handleApi } = require('./lib/api-routes');
const { serveStatic } = require('./lib/static-files');
const cliSync = require('./lib/session-cli-sync');

const config = loadConfig();
cliSync.start(config); // sessions show their CLI conversations, kept up to date

const server = http.createServer(async (request, response) => {
  try {
    if (!isAllowedRequest(request, config.port)) return sendJson(response, 403, { error: 'forbidden' });
    if (request.url.startsWith('/api/')) return await handleApi(request, response, config);
    serveStatic(request, response);
  } catch (error) {
    // 501 = this Claude Code version lacks the feature; the browser shows a neutral note, so it is not a failure to log.
    if (error.status !== 501) console.error('[server] request failed:', request.method, request.url, error);
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.message });
  }
});

server.on('error', error => {
  console.error(`[server] cannot listen on port ${config.port}:`, error.message);
  process.exit(1);
});

// Bound to loopback only: this server can run commands on the machine.
server.listen(config.port, '127.0.0.1', () => {
  console.log(`Claude GUI is running: http://127.0.0.1:${config.port}`);
  const baseUrl = config.env.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || '(not set)';
  console.log(`claudePath: ${config.claudePath} | model: ${config.model || '(CLI default)'} | ANTHROPIC_BASE_URL: ${baseUrl}`);
});
