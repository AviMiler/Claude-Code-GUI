/**
 * Asks an Ollama server how large a model's context window really is. Claude Code assumes its own 200K window for any
 * model name, but a local model behind ANTHROPIC_BASE_URL usually runs with far less (Ollama's num_ctx).
 * Read-only requests, built from the cleaned base URL (no user:password), the token only as a header, 4 s timeout.
 * Every failure (server down, a non-Ollama server answering 404, odd JSON) yields null: the caller falls back.
 */
const TIMEOUT_MS = 4000;

/** The Ollama root for a base URL as Claude Code gets it: a trailing "v1/" (OpenAI-style path) is not part of it. */
function ollamaRoot(cleanUrl) {
  const url = new URL(cleanUrl);
  url.pathname = url.pathname.replace(/\/v1\/?$/, '/');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

async function call(root, path, { token, key }, body) {
  const response = await fetch(new URL(path, root), {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...(key && { 'x-api-key': key }) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error', // a redirect to another host would get the key header
  });
  if (!response.ok) { await response.arrayBuffer().catch(() => {}); return null; }
  return response.json().catch(() => null);
}

const positive = value => (Number.isInteger(value) && value > 0 ? value : null);

/**
 * @param {string} parameters the Modelfile parameters text of /api/show ("num_ctx    32768\nstop ...")
 * @returns {number|null}
 * @example parseNumCtx('num_ctx                        32768\ntemperature 0.7') // 32768
 */
function parseNumCtx(parameters) {
  const match = /^\s*num_ctx\s+(\d+)\s*$/m.exec(String(parameters || ''));
  return match ? positive(Number(match[1])) : null;
}

/** The trained maximum: model_info["<architecture>.context_length"] (the prefix varies: llama, qwen3, gemma3...). */
function modelMax(modelInfo) {
  const entry = Object.entries(modelInfo || {}).find(([name]) => name.endsWith('.context_length'));
  return entry ? positive(Number(entry[1])) : null;
}

/**
 * @param {string} cleanUrl the base URL without credentials (displayUrl in model-health.js)
 * @param {string} model a validated model name
 * @param {{token:string, key:string}} auth
 * @returns {Promise<{numCtx:number|null, loaded:number|null, max:number|null}|null>} null: not an answering Ollama
 *   loaded: the context the model runs with right now (/api/ps), only when it is loaded
 */
async function ollamaWindow(cleanUrl, model, auth) {
  try {
    const root = ollamaRoot(cleanUrl);
    const [show, ps] = await Promise.all([call(root, 'api/show', auth, { model }), call(root, 'api/ps', auth).catch(() => null)]);
    if (!show) return null;
    const running = (ps?.models || []).find(item => item.name === model || item.model === model);
    return { numCtx: parseNumCtx(show.parameters), loaded: positive(running?.context_length), max: modelMax(show.model_info) };
  } catch {
    return null; // refused, timed out, not JSON: never an error with the URL in it
  }
}

module.exports = { ollamaWindow, parseNumCtx, modelMax, ollamaRoot };
