/**
 * Fake CLI (fake-claude.js): messages that arrive while a turn runs (the GUI's corrections carry a uuid). Like the real
 * CLI's queue they join the turn between steps and are replayed with their uuid; one that comes too late starts the next turn.
 */
function createCorrections(out, sessionId) {
  let pending = [];
  return {
    add: (uuid, text) => { pending.push({ uuid, text }); },
    /** Between steps: every waiting message joins the turn now. @returns {string[]} their texts */
    drain() {
      const taken = pending;
      pending = [];
      taken.forEach(item => out({ type: 'user', isReplay: true, uuid: item.uuid, message: { role: 'user', content: item.text }, parent_tool_use_id: null, session_id: sessionId }));
      return taken.map(item => item.text);
    },
    cancel(uuid) { const before = pending.length; pending = pending.filter(item => item.uuid !== uuid); return before !== pending.length; },
    sweep: () => { pending = []; }, // an interrupt drops what did not join yet
    size: () => pending.length,
  };
}

module.exports = { createCorrections };
