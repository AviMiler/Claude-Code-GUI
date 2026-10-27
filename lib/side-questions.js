/**
 * /btw side questions: asks Claude about the current conversation without interrupting the running turn and
 * without adding to the conversation (the CLI's `side_question` control request). Calls the model, so it costs tokens.
 */
const service = require('./session-service');
const runtime = require('./session-runtime');
const { httpError } = require('./http-utils');
const { requireRunnable } = require('./session-common');

// The local model can be slow; the CLI has its own deadline, this only keeps a stuck request from waiting forever.
const SIDE_QUESTION_TIMEOUT_MS = 10 * 60000;
const MAX_QUESTION_CHARS = 4000;
const MAX_HISTORY = 20;
// Older CLIs (e.g. 2.1.246) answer an unknown control request with an error like this.
const UNSUPPORTED = /unsupported|not supported|unknown (control )?request/i;

const isText = value => typeof value === 'string' && value.trim().length > 0;

/** Earlier side questions of this session (for follow-ups), in the shape the CLI expects. */
function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(entry => isText(entry?.question) && typeof entry?.response === 'string')
    .slice(-MAX_HISTORY).map(entry => ({ question: entry.question, response: entry.response }));
}

/**
 * @param {string} sessionId
 * @param {{question:string, history?:{question:string, response:string}[]}} body
 * @param {object} config
 * @returns {Promise<{response:string|null, notice:string|null}>} notice: the CLI's note when it answered without the
 *   conversation's context (fallback)
 * @example await ask(id, { question: 'What file are you editing?' }, config)
 */
async function ask(sessionId, { question, history }, config) {
  const session = requireRunnable(service.requireSession(sessionId));
  if (!isText(question)) throw httpError(400, 'השאלה ריקה');
  if (question.length > MAX_QUESTION_CHARS) throw httpError(400, `השאלה ארוכה מדי (עד ${MAX_QUESTION_CHARS} תווים)`);
  try {
    const answer = await runtime.control(session, config, 'side_question',
      { question: question.trim(), history: cleanHistory(history) }, SIDE_QUESTION_TIMEOUT_MS);
    return { response: typeof answer?.response === 'string' ? answer.response : null, notice: answer?.fallback_notice || null };
  } catch (error) {
    if (error.status) throw error;
    // The message keeps "not supported" so the browser shows its neutral "not in this version" note (panels/kit.js isUnsupported).
    if (UNSUPPORTED.test(error.message)) throw httpError(501, `side_question is not supported by this Claude Code version: ${error.message}`);
    throw httpError(502, `Claude לא ענה לשאלת הצד: ${error.message}`);
  }
}

module.exports = { ask };
