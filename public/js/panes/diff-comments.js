/**
 * Line comments on the Changes pane's diff (like Claude Code Desktop): kept per session in memory until they are
 * sent to Claude together as one message.
 */

const MAX_QUOTE_CHARS = 200;
const commentsBySession = new Map(); // session id -> Comment[]
let nextId = 1;

/**
 * @typedef {object} Comment
 * @property {number} id
 * @property {string} path      file path as git shows it (relative to the repository)
 * @property {'new'|'old'} side old: a deleted line, numbered in the old version of the file
 * @property {number} line
 * @property {string} quote     the line's text when the comment was written (anchors it after a refresh)
 * @property {string} text
 */

/** @returns {Comment[]} */
export const commentsOf = sessionId => commentsBySession.get(sessionId) || [];

/** @param {string} sessionId @param {Omit<Comment, 'id'>} comment */
export function addComment(sessionId, comment) {
  commentsBySession.set(sessionId, [...commentsOf(sessionId), { ...comment, id: nextId++ }]);
}

export function removeComment(sessionId, id) {
  commentsBySession.set(sessionId, commentsOf(sessionId).filter(comment => comment.id !== id));
}

export function clearComments(sessionId) {
  commentsBySession.delete(sessionId);
}

/**
 * The message Claude gets for all comments: one block per comment with the file, the line and its text.
 * Starts with a Hebrew line, never with "/", so it is never taken for a slash command.
 * @param {Comment[]} comments
 * @returns {string}
 * @example composeMessage([{ path: 'app.js', side: 'new', line: 12, quote: 'const a = 1;', text: 'rename' }])
 */
export function composeMessage(comments) {
  const blocks = comments.map(comment => {
    const where = comment.side === 'old' ? `${comment.path}, שורה ${comment.line} בגרסה הקודמת (שורה שנמחקה)` : `${comment.path}:${comment.line}`;
    const quote = comment.quote.length > MAX_QUOTE_CHARS ? `${comment.quote.slice(0, MAX_QUOTE_CHARS)}…` : comment.quote;
    return `- ${where}\n  > ${quote.trim()}\n  ${comment.text.trim()}`;
  });
  return `הערות על השינויים (${comments.length}) — תקן לפי ההערות:\n\n${blocks.join('\n\n')}`;
}
