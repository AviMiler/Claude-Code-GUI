/**
 * Fake CLI (fake-claude.js): an MCP elicitation, the way the SDK protocol sends it: a control_request with subtype
 * `elicitation` (server name, message, mode, requested schema or url) that the GUI answers with { action, content? }.
 */
const FORM = {
  mcp_server_name: 'inventory', mode: 'form', message: 'איזה פריט להזמין?\n<img src=x onerror="window.__xss=1">',
  requested_schema: {
    type: 'object', required: ['name', 'qty'],
    properties: {
      name: { type: 'string', title: 'שם הפריט', description: 'כפי שמופיע בקטלוג', default: 'בורג' },
      qty: { type: 'integer', title: 'כמות', minimum: 1, maximum: 100, default: 5 },
      urgent: { type: 'boolean', title: 'דחוף', default: false },
      color: { type: 'string', title: 'צבע', enum: ['red', 'blue'], enumNames: ['אדום', 'כחול'] },
      tags: { type: 'array', title: 'תגיות', items: { type: 'string', enum: ['a', 'b', 'c'] } },
      meta: { type: 'object', title: 'מטא (JSON)', properties: { x: { type: 'string' } } },
    },
  },
};
const URL_ASK = { mcp_server_name: 'oauth-demo', mode: 'url', message: 'יש להתחבר בדפדפן', url: 'https://example.com/login?x=1', elicitation_id: 'el-1' };

/** @param {(event:object)=>void} out @param {Map} waiting request id -> resolver of the GUI's reply @param {string} id @returns {Promise<object>} the reply */
function elicit(out, waiting, id, kind) {
  out({ type: 'control_request', request_id: id, request: { subtype: 'elicitation', ...(kind === 'url' ? URL_ASK : FORM) } });
  return new Promise(resolve => waiting.set(id, resolve));
}

module.exports = { elicit };
