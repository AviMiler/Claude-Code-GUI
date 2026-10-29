/** The reply to an MCP elicitation: what goes back to the CLI for an answer of the card (accept with content, decline, cancel). */
const { httpError } = require('../http-utils');
const { validateContent } = require('./elicitation-validate');

const ACTIONS = ['accept', 'decline', 'cancel'];

/**
 * @param {object} prompt a prompt from normalizeElicitation @param {{action:string, content?:object}} answer from the browser
 * @returns {{action:'accept'|'decline'|'cancel', content?:object}} the reply; throws 400 and the request stays pending when the content does not fit
 */
function replyFor(prompt, answer) {
  if (!ACTIONS.includes(answer.action)) throw httpError(400, 'פעולה לא מוכרת');
  if (answer.action !== 'accept') return { action: answer.action };
  return prompt.mode === 'url' ? { action: 'accept' } : { action: 'accept', content: validateContent(prompt.fields, answer.content) };
}

/** What a stop of the turn sends to a waiting elicitation. */
const CANCEL_REPLY = { action: 'cancel' };

module.exports = { replyFor, CANCEL_REPLY };
