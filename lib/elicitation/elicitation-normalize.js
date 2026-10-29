/**
 * An MCP server's elicitation request (it asks the user for input mid-turn) turned into a prompt the browser can draw.
 * Everything in it comes from the MCP server, so it is cut to size here and only ever shown as text.
 */
const MAX_MESSAGE = 4000;
const MAX_NAME = 100;
const MAX_FIELDS = 50;
const MAX_OPTIONS = 100;
const MAX_TEXT = 500;
const MAX_URL = 2048;

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Options of a choice: `enum` (+ `enumNames`) or `oneOf: [{const, title}]`. @returns {{value:string|number, label:string}[]|null} */
function optionsOf(spec) {
  const list = Array.isArray(spec?.oneOf) ? spec.oneOf.map(item => ({ value: item?.const, label: item?.title }))
    : Array.isArray(spec?.enum) ? spec.enum.map((value, index) => ({ value, label: spec.enumNames?.[index] })) : null;
  if (!list) return null;
  const valid = list.filter(option => ['string', 'number'].includes(typeof option.value)).slice(0, MAX_OPTIONS);
  return valid.map(option => ({ value: option.value, label: text(option.label, MAX_TEXT) || String(option.value).slice(0, MAX_TEXT) }));
}

/** One property of the schema. A type the card cannot draw becomes `json` (a text box that must hold valid JSON). */
function normalizeField(name, spec, required) {
  const base = { name: name.slice(0, MAX_TEXT), title: text(spec?.title, MAX_TEXT) || name.slice(0, MAX_TEXT), description: text(spec?.description, MAX_TEXT), required, default: spec?.default };
  const choices = optionsOf(spec);
  if (spec?.type === 'array') {
    const items = optionsOf(spec.items);
    return items?.length ? { ...base, type: 'multiselect', options: items } : { ...base, type: 'json', default: undefined };
  }
  if (choices?.length && (spec.type === 'string' || spec.type === undefined)) return { ...base, type: 'select', options: choices };
  if (spec?.type === 'boolean') return { ...base, type: 'boolean' };
  if (spec?.type === 'number' || spec?.type === 'integer') return { ...base, type: spec.type, min: finite(spec.minimum), max: finite(spec.maximum) };
  if (spec?.type === 'string') return { ...base, type: 'string', format: text(spec.format, 40) };
  return { ...base, type: 'json', default: undefined };
}

/**
 * @param {string} requestId @param {object} request the control request: server name, message, mode ('form' | 'url'), url,
 *   requested schema (read under the key names the protocol is known to use)
 * @returns {{requestId:string, kind:'elicitation', serverName:string, message:string, mode:'form'|'url', url:string, fields:object[], createdAt:number}}
 */
function normalizeElicitation(requestId, request) {
  const schema = request.requested_schema ?? request.requestedSchema ?? request.schema ?? {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const properties = schema.properties && typeof schema.properties === 'object' ? Object.entries(schema.properties) : [];
  return {
    requestId, kind: 'elicitation', createdAt: Date.now(),
    serverName: text(request.mcp_server_name ?? request.server_name ?? request.serverName, MAX_NAME) || 'MCP',
    message: text(request.message, MAX_MESSAGE),
    mode: request.mode === 'url' ? 'url' : 'form',
    url: text(request.url, MAX_URL),
    fields: request.mode === 'url' ? [] : properties.slice(0, MAX_FIELDS).map(([name, spec]) => normalizeField(name, spec, required.has(name))),
  };
}

module.exports = { normalizeElicitation };
