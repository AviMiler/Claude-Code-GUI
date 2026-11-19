/**
 * Tiny fake Ollama for testing the context-window detection (lib/context/): answers GET /v1/models, POST /api/show
 * and GET /api/ps. Usage: node dev/fake-ollama.js [port] (default 11499), then ANTHROPIC_BASE_URL=http://127.0.0.1:<port>.
 * FAKE_OLLAMA_MODE: "num_ctx" (default: num_ctx 32768 in the parameters, trained max 262144), "max" (no num_ctx: only
 * the trained maximum), "loaded" (no num_ctx, /api/ps reports 8192), "404" (a non-Ollama server: /api/* is 404).
 * FAKE_OLLAMA_LOG=1 prints every request with its authorization header (to check the token is sent as a header).
 */
const http = require('http');

const port = Number(process.argv[2] || 11499);
const mode = () => process.env.FAKE_OLLAMA_MODE || 'num_ctx';

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function show(model) {
  const parameters = mode() === 'num_ctx' ? 'num_ctx                        32768\nstop                           "<|im_end|>"' : 'stop "<|im_end|>"';
  return { modelfile: `FROM ${model}`, parameters, details: { family: 'qwen3' }, model_info: { 'general.architecture': 'qwen3', 'qwen3.context_length': 262144 } };
}

http.createServer((request, response) => {
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    if (process.env.FAKE_OLLAMA_LOG === '1') console.log(request.method, request.url, request.headers.authorization || '-', body);
    if (request.url === '/v1/models') return send(response, 200, { data: [{ id: 'qwen3.8:27b' }, { id: 'fake-model' }] });
    if (mode() === '404' || !request.url.startsWith('/api/')) return send(response, 404, { error: 'not found' });
    if (request.method === 'POST' && request.url === '/api/show') {
      const { model } = JSON.parse(body || '{}');
      return model ? send(response, 200, show(model)) : send(response, 400, { error: 'model is required' });
    }
    if (request.url === '/api/ps') {
      return send(response, 200, { models: mode() === 'loaded' ? [{ name: 'fake-model', model: 'fake-model', context_length: 8192 }] : [] });
    }
    return send(response, 404, { error: 'not found' });
  });
}).listen(port, '127.0.0.1', () => console.log(`fake ollama on http://127.0.0.1:${port} (${mode()})`));
