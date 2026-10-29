/**
 * The models the user can really switch between.
 * Why not the CLI's own list: with a custom ANTHROPIC_BASE_URL (Ollama, a proxy) its entries (default, opus, sonnet,
 * haiku) are aliases that all lead to the ANTHROPIC_DEFAULT_*_MODEL names, usually one local model. The real list
 * is what the model server serves (GET /v1/models), plus the names configured in config.json and its env.
 * Together with the health check (lib/model-health.js, the same GET), this is the GUI server's only network call,
 * and only to the server Claude Code itself is configured to use.
 */
const CACHE_MS = 5 * 60000;
const TIMEOUT_MS = 4000;
const CONFIGURED_ENV = ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL'];
const NOT_CHAT = /embed|rerank|whisper|tts/i; // models a server lists that cannot hold a conversation
let cache = null; // { at, promise }

const envOf = (config, name) => config.env[name] ?? process.env[name] ?? '';

/** Model names written in config.json (model) and its env (ANTHROPIC_MODEL, ANTHROPIC_DEFAULT_*_MODEL...). */
function configuredModels(config) {
  return [...new Set([config.model, ...CONFIGURED_ENV.map(name => envOf(config, name))].filter(Boolean))];
}

async function getJson(url, config) {
  const token = envOf(config, 'ANTHROPIC_AUTH_TOKEN');
  const key = envOf(config, 'ANTHROPIC_API_KEY');
  const response = await fetch(url, {
    headers: { 'anthropic-version': '2023-06-01', ...(token && { authorization: `Bearer ${token}` }), ...(key && { 'x-api-key': key }) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Anthropic and OpenAI-compatible servers (Ollama, LiteLLM, vLLM) answer /v1/models with { data: [{ id }] };
 * older Ollama versions only have /api/tags with { models: [{ name }] }.
 */
async function serverModels(baseUrl, config) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  let body;
  try {
    body = await getJson(new URL('v1/models', base), config);
  } catch (error) {
    body = await getJson(new URL('api/tags', base), config).catch(() => { throw error; });
  }
  return (body.data || body.models || [])
    .map(model => ({ value: model.id || model.name || model.model, displayName: model.display_name || model.id || model.name }))
    .filter(model => model.value && !NOT_CHAT.test(model.value));
}

const isAnthropic = baseUrl => { try { return /(^|\.)anthropic\.com$/.test(new URL(baseUrl).hostname); } catch { return false; } };

async function load(config) {
  const baseUrl = envOf(config, 'ANTHROPIC_BASE_URL');
  const configured = configuredModels(config);
  // Anthropic itself: the CLI's list (aliases) is the right one; the browser takes it from the catalog.
  if (!baseUrl || isAnthropic(baseUrl)) return { source: 'cli', models: [], current: configured[0] || '', error: null };
  let models = [];
  let error = null;
  try {
    models = await serverModels(baseUrl, config);
  } catch (failure) {
    error = `לא ניתן לקרוא את רשימת המודלים מ-${baseUrl}: ${failure.message}`;
  }
  for (const value of configured) {
    if (!models.some(model => model.value === value)) models.push({ value, displayName: value, description: 'מוגדר ב-config.json' });
  }
  // Nothing known at all: the CLI's list is still better than an empty one.
  if (!models.length) return { source: 'cli', models: [], current: '', error };
  return { source: 'server', models, current: configured[0] || models[0]?.value || '', error };
}

/**
 * @param {object} config
 * @param {{refresh?:boolean}} [options]
 * @returns {Promise<{source:'cli'|'server', models:{value:string, displayName:string, description?:string}[], current:string, error:string|null}>}
 * @example const { models } = await listModels(config); // [{ value: 'qwen3.8:27b', displayName: 'qwen3.8:27b' }]
 */
function listModels(config, { refresh = false } = {}) {
  if (refresh || !cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), promise: load(config) };
  return cache.promise;
}

module.exports = { listModels, configuredModels, envOf, isAnthropic };
