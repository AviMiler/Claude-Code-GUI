/**
 * Reads what the installed CLI offers (slash commands, skills, agents, models, MCP, context...)
 * through the control protocol. Nothing here calls the model, so it costs no tokens.
 */
const service = require('./session-service');
const runtime = require('./session-runtime');
const { startProcess } = require('./cli-process');
const { httpError } = require('./http-utils');

const READ_SUBTYPES = new Set([
  'get_status', 'get_context_usage', 'get_settings', 'list_permission_rules', 'get_hooks_listing',
  'get_memory_dialog', 'get_session_cost', 'get_skills_dialog', 'mcp_status', 'get_plan', 'get_usage',
]);
const WRITE_SUBTYPES = new Set(['mcp_toggle', 'mcp_reconnect', 'reload_plugins', 'reload_skills']);
const PROBE_CACHE_MS = 60000;
const probeCache = new Map(); // cwd -> { at, promise }

/**
 * @param {object|null} init `initialize` response. @param {object|null} skills `get_skills_dialog` response.
 * @returns {object} Stable catalog shape for the frontend.
 */
function shapeCatalog(init, skills) {
  if (!init) return { available: false, commands: [], agents: [], models: [], skills: [], outputStyles: [] };
  return {
    available: true, version: init.claude_code_version || null, commands: init.commands || [],
    agents: init.agents || [], models: init.models || [], skills: skills?.skills || [],
    outputStyle: init.output_style || 'default', outputStyles: init.available_output_styles || [],
    account: init.account || null, permissionMode: init.current_permission_mode || null,
    fastMode: init.fast_mode_state || null,
  };
}

function checkSubtype(subtype) {
  if (!READ_SUBTYPES.has(subtype) && !WRITE_SUBTYPES.has(subtype)) throw httpError(400, `בקשה לא מותרת: ${subtype}`);
}

/**
 * Catalog of a session: from its own process when one is running, otherwise from a short-lived probe
 * in the session folder. Why: just looking at a session must not keep a full CLI process alive.
 */
async function getSessionCatalog(sessionId, config) {
  const session = service.requireSession(sessionId);
  if (!runtime.infoFor(sessionId).alive) return getFolderCatalog(config, session.cwd);
  const live = await runtime.ensure(session, config);
  const init = await live.initialize;
  const skills = init ? await runtime.control(session, config, 'get_skills_dialog').catch(() => null) : null;
  return shapeCatalog(init, skills);
}

async function sessionControl(sessionId, subtype, payload, config) {
  checkSubtype(subtype);
  try {
    return await runtime.control(service.requireSession(sessionId), config, subtype, payload);
  } catch (error) {
    if (error.status) throw error;
    throw httpError(502, `Claude לא ענה ל-${subtype}: ${error.message}`);
  }
}

/**
 * Runs control requests in a short-lived process (used when no session is open).
 * @param {object} config @param {string} cwd
 * @param {{subtype:string, payload?:object}[]} requests
 * @returns {Promise<Array<{ok:boolean, response?:object, error?:string}>>}
 */
function probe(config, cwd, requests) {
  return new Promise(resolve => {
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
    if (config.model) args.push('--model', config.model);
    const results = [];
    let finished = false;
    const done = () => { if (!finished) { finished = true; resolve(results); } };
    const proc = startProcess(config, args, cwd, {
      onMessage: () => {}, onControlCancel: () => {},
      onControlRequest: (id, request) => proc.respondError(id, `${request.subtype} is not supported by the GUI`),
      onExit: done,
    });
    (async () => {
      for (const { subtype, payload } of [{ subtype: 'initialize' }, ...requests]) {
        try {
          results.push({ ok: true, response: await proc.request(subtype, payload || {}, 60000) });
        } catch (error) {
          results.push({ ok: false, error: error.message });
        }
      }
      proc.close();
      setTimeout(() => { proc.kill(); done(); }, 5000);
    })();
  });
}

/** Catalog for a folder without a session (cached briefly). */
async function getFolderCatalog(config, cwd) {
  const cached = probeCache.get(cwd);
  if (cached && Date.now() - cached.at < PROBE_CACHE_MS) return cached.promise;
  const promise = probe(config, cwd, [{ subtype: 'get_skills_dialog' }]).then(([init, skills]) =>
    shapeCatalog(init?.ok ? init.response : null, skills?.ok ? skills.response : null));
  probeCache.set(cwd, { at: Date.now(), promise });
  return promise;
}

async function folderControl(config, cwd, subtype, payload) {
  checkSubtype(subtype);
  const [, result] = await probe(config, cwd, [{ subtype, payload }]);
  if (!result?.ok) throw httpError(502, `Claude לא ענה ל-${subtype}: ${result?.error || 'אין תשובה'}`);
  return result.response;
}

module.exports = { getSessionCatalog, sessionControl, getFolderCatalog, folderControl, shapeCatalog };
