/**
 * The real context window of the model a session uses, for the context ring, the rail and the usage panel.
 * Source order: config.contextWindow > Ollama's num_ctx (Modelfile) > the context the loaded model runs with
 * (/api/ps) > the model's trained maximum (an upper bound: Ollama's default context is usually far lower) > null
 * (the browser then uses the CLI's own maxTokens). Only a custom ANTHROPIC_BASE_URL is ever asked; cached 5 minutes.
 */
const { envOf, isAnthropic, configuredModels } = require('../model-list');
const { displayUrl } = require('../model-health');
const { MODEL_ID } = require('../session-options');
const { ollamaWindow } = require('./ollama-window');

const CACHE_MS = 5 * 60000;
const MISS_MS = 30000; // nothing found (server down, not Ollama): asked again sooner, the server may be starting
const DEFAULT_WARN_PERCENT = 70;
const ALIASES = { opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL', sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL', haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL' };
const cache = new Map(); // model -> { at, promise }

/** A positive integer or null: config.contextWindow (0 or absent = detect). */
const windowSetting = config => (Number.isInteger(config.contextWindow) && config.contextWindow > 0 ? config.contextWindow : null);

/** config.contextWarnPercent: an integer 1..100, otherwise the default 70. */
function warnPercent(config) {
  const value = config.contextWarnPercent;
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : DEFAULT_WARN_PERCENT;
}

/**
 * The model name the server is asked about: what the running CLI reported, else the session's or the configured one.
 * An alias (opus, sonnet, haiku) leads to its ANTHROPIC_DEFAULT_*_MODEL, the name the model server knows.
 */
function modelFor(session, config, runningModel) {
  const name = runningModel || session.model || config.model || configuredModels(config)[0] || '';
  const alias = ALIASES[name.toLowerCase().replace(/\[.*\]$/, '')];
  return alias ? envOf(config, alias) || name : name;
}

async function detect(config, model) {
  const baseUrl = envOf(config, 'ANTHROPIC_BASE_URL');
  if (!baseUrl || isAnthropic(baseUrl) || !MODEL_ID.test(model)) return { window: null, source: null, estimate: false };
  const url = displayUrl(baseUrl);
  const found = url && await ollamaWindow(url, model, { token: envOf(config, 'ANTHROPIC_AUTH_TOKEN'), key: envOf(config, 'ANTHROPIC_API_KEY') });
  if (found?.numCtx) return { window: found.numCtx, source: 'num_ctx', estimate: false };
  if (found?.loaded) return { window: found.loaded, source: 'loaded', estimate: false };
  if (found?.max) return { window: found.max, source: 'model', estimate: true };
  return { window: null, source: null, estimate: false };
}

/**
 * @param {object} config @param {object} session as stored @param {string} [runningModel] from the CLI's init event
 * @returns {Promise<{window:number|null, source:'config'|'num_ctx'|'loaded'|'model'|null, estimate:boolean, model:string, warnPercent:number}>}
 *   estimate: only the model's maximum is known, the real window may be much smaller
 * @example await contextWindowFor(config, session) // { window: 32768, source: 'num_ctx', estimate: false, model: 'qwen3.8:27b', warnPercent: 70 }
 */
async function contextWindowFor(config, session, runningModel) {
  const model = modelFor(session, config, runningModel);
  const extra = { model: MODEL_ID.test(model) ? model : '', warnPercent: warnPercent(config) };
  const fixed = windowSetting(config);
  if (fixed) return { window: fixed, source: 'config', estimate: false, ...extra };
  let entry = cache.get(model);
  if (!entry || Date.now() - entry.at > (entry.miss ? MISS_MS : CACHE_MS)) {
    entry = { at: Date.now(), miss: false, promise: detect(config, model) };
    entry.promise.then(found => { entry.miss = !found.window; });
    cache.set(model, entry);
  }
  return { ...(await entry.promise), ...extra };
}

module.exports = { contextWindowFor, modelFor, warnPercent, windowSetting };
