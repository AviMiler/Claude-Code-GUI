/**
 * Claude Code Stop hook of a GUI session (verify loop). Run by the CLI as:
 *   "<node>" "<this file>" <port> <process key>
 * Reads the hook's JSON from stdin, asks the GUI server whether Claude may stop, and exits 2 with the reason on
 * stderr when the server says "block" (the CLI then continues the turn with that reason). Any failure (server down,
 * timeout, bad answer) exits 0 silently: this hook must never trap the model. The secret comes from the environment.
 */
const http = require('http');

const [port, key] = process.argv.slice(2);
const REQUEST_TIMEOUT_MS = 140000; // the server's check takes up to 120 s; the CLI kills this hook at 150 s
const allow = () => process.exit(0);

function readStdin() {
  return new Promise(resolve => {
    const chunks = [];
    const done = () => resolve(Buffer.concat(chunks).toString('utf8'));
    setTimeout(done, 5000); // a stdin that is never closed must not hold the stop
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', done);
    process.stdin.on('error', done);
  });
}

async function main() {
  if (!/^\d+$/.test(port || '') || !/^[\w-]+$/.test(key || '')) return allow();
  const input = await readStdin();
  let body;
  try { body = JSON.stringify(JSON.parse(input || '{}')); } catch { body = '{}'; }
  const request = http.request({
    host: '127.0.0.1', port: Number(port), method: 'POST', path: `/api/sessions/${key}/verify-hook`, timeout: REQUEST_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Verify-Secret': process.env.CLAUDE_GUI_VERIFY_SECRET || '' },
  }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      let answer = null;
      try { answer = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return allow(); }
      if (response.statusCode !== 200 || answer?.decision !== 'block' || typeof answer.reason !== 'string') return allow();
      process.stderr.write(answer.reason, () => process.exit(2));
    });
    response.on('error', allow);
  });
  request.on('timeout', () => { request.destroy(); allow(); });
  request.on('error', allow);
  request.end(body);
}

main().catch(allow);
