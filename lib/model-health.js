/**
 * Is the model server up? A read-only GET {ANTHROPIC_BASE_URL}/v1/models (the same request as the model list),
 * only for a custom base URL: the cloud is never pinged. Up = a 2xx answer; down = no answer in time, a refused
 * connection, or an HTTP error (401, 404, 500…: Claude Code cannot use the server either).
 */
const { envOf, isAnthropic } = require('./model-list');

const TIMEOUT_MS = 4000;
const CACHE_MS = 15000; // many tabs poll; they share one request
let cache = null; // { at, promise }

/** The base URL as shown to the user: no user:password, no query. */
function displayUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    url.username = '';
    url.password = '';
    url.search = '';
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.toString();
  } catch {
    return '';
  }
}

async function probe(config) {
  const baseUrl = envOf(config, 'ANTHROPIC_BASE_URL');
  const checkedAt = Date.now();
  if (!baseUrl || isAnthropic(baseUrl)) return { state: 'unknown', latencyMs: null, error: null, url: '', checkedAt };
  const url = displayUrl(baseUrl);
  const token = envOf(config, 'ANTHROPIC_AUTH_TOKEN');
  const key = envOf(config, 'ANTHROPIC_API_KEY');
  const started = Date.now();
  try {
    // From the cleaned URL: fetch refuses a URL with user:password in it.
    const response = await fetch(new URL('v1/models', url), {
      headers: { 'anthropic-version': '2023-06-01', ...(token && { authorization: `Bearer ${token}` }), ...(key && { 'x-api-key': key }) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.arrayBuffer().catch(() => {}); // drain, so the connection is released
    const latencyMs = Date.now() - started;
    return response.ok ? { state: 'up', latencyMs, error: null, url, checkedAt }
      : { state: 'down', latencyMs, error: `השרת ענה HTTP ${response.status}`, url, checkedAt };
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    const reason = timedOut ? `אין תשובה תוך ${TIMEOUT_MS / 1000} שניות` : error.cause?.code || error.cause?.message || error.message;
    return { state: 'down', latencyMs: null, error: reason, url, checkedAt };
  }
}

/**
 * @param {object} config
 * @param {{refresh?:boolean}} [options] refresh: skip the 15 s cache (a click on the indicator)
 * @returns {Promise<{state:'up'|'down'|'unknown', latencyMs:number|null, error:string|null, url:string, checkedAt:number}>}
 * @example await checkModelServer(config) // { state: 'up', latencyMs: 38, error: null, url: 'http://172.27.5.5:11436/', … }
 */
function checkModelServer(config, { refresh = false } = {}) {
  if (refresh || !cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), promise: probe(config) };
  return cache.promise;
}

module.exports = { checkModelServer };
