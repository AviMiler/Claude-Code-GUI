// Messages may carry images (≤5 MB each) and files (≤25 MB each), base64-encoded (+33%); the browser keeps a message under 60 MB.
const MAX_BODY_BYTES = 90 * 1024 * 1024;

/** Creates an Error carrying an HTTP status, caught by server.js. */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

/** Reads a JSON request body (empty body gives {}). */
function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(httpError(413, 'הבקשה גדולה מדי'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(httpError(400, 'JSON לא תקין'));
      }
    });
    request.on('error', reject);
  });
}

/**
 * Blocks other websites from driving this server (DNS rebinding / cross-site POST).
 * Why: sessions can run with permissions that execute commands.
 */
function isAllowedRequest(request, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(request.headers.host)) return false;
  const origin = request.headers.origin;
  return !origin || hosts.some(host => origin === `http://${host}`);
}

module.exports = { httpError, sendJson, readJson, isAllowedRequest };
