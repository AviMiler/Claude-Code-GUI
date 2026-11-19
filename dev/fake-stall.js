/**
 * The fake CLI's "stall" keyword (fake-claude.js): a few tokens, then silence for FAKE_STALL_MS (default 70000), like a
 * stuck model server, then tokens again. An interrupt ends the silence at once. Tests the GUI's stall line (stall/).
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @param {(message:object)=>void} out @param {string} sessionId @param {()=>boolean} interrupted */
async function stall(out, sessionId, interrupted) {
  const token = text => out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, session_id: sessionId });
  token('מתחיל לענות… ');
  const until = Date.now() + Number(process.env.FAKE_STALL_MS || 70000);
  while (Date.now() < until && !interrupted()) await sleep(100);
  if (!interrupted()) token('וממשיך אחרי השתיקה. ');
}

module.exports = { stall };
