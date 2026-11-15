/**
 * Context numbers of the fake CLI (fake-claude.js): the conversation grows with every turn, so the ring, the rail and
 * the early warning can be watched filling up.
 * FAKE_CONTEXT_TOKENS: tokens before the first turn (default 11600); FAKE_CONTEXT_STEP: added per turn (default 2000);
 * FAKE_CONTEXT_MAX: the CLI's own window (default 200000); FAKE_CONTEXT_UNSUPPORTED=1: get_context_usage fails like
 * on 2.1.246 ("Unsupported control request subtype").
 */
const env = (name, fallback) => Number(process.env[name] || fallback);
let turns = 0;

const total = () => env('FAKE_CONTEXT_TOKENS', 11600) + turns * env('FAKE_CONTEXT_STEP', 2000);

/** The get_context_usage answer. */
function usage() {
  if (process.env.FAKE_CONTEXT_UNSUPPORTED === '1') throw new Error('Unsupported control request subtype: get_context_usage');
  const max = env('FAKE_CONTEXT_MAX', 200000);
  const tokens = total();
  return {
    categories: [{ name: 'System prompt', tokens: 2600, kind: 'used' }, { name: 'Messages', tokens: tokens - 2600, kind: 'used' },
      { name: 'Autocompact buffer', tokens: 45000, kind: 'buffer' }, { name: 'Free space', tokens: Math.max(0, max - tokens - 45000), kind: 'free' }],
    totalTokens: tokens, maxTokens: max, percentage: Math.round((tokens / max) * 100),
  };
}

/** The `usage` of a turn's result: the input side is the whole conversation so far, like a real model call. */
function turnUsage() {
  turns += 1;
  return { input_tokens: total() - 48, output_tokens: 48 };
}

module.exports = { usage, turnUsage };
