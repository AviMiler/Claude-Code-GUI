/**
 * A turn's cost as the CLI counts it (the user's decision: the cost comes from the CLI, DECISIONS.md 2026-10-30). The CLI
 * keeps a running total per process (`get_usage` session.total_cost_usd); a turn costs what that total grew by. When a
 * reading is missing (a CLI without `get_usage`, a failed or late answer), the turn takes the result's own
 * `total_cost_usd` (per turn or the process's running total: UNVERIFIED), and the next turn measures from the new reading.
 */
const USAGE_TIMEOUT_MS = 2000;

/** @returns {Promise<number|null>} the CLI's running total for the process, null when it cannot say */
async function readTotal(runtime) {
  try {
    const total = (await runtime.proc.request('get_usage', {}, USAGE_TIMEOUT_MS))?.session?.total_cost_usd;
    return typeof total === 'number' ? total : null;
  } catch {
    return null;
  }
}

/** What the CLI counts before the first turn (a resumed conversation may bring an earlier total). Once per process, after initialize. */
function startCounting(runtime) {
  runtime.costBefore = Promise.resolve(runtime.initialize).then(() => readTotal(runtime));
}

/**
 * @param {object} runtime @param {{total_cost_usd?:number}} result the CLI's result event (also a failed or stopped turn)
 * @returns {Promise<number|null>} the turn's cost; null when the CLI gives none
 * @example const costUsd = await turnCost(runtime, event); // 0.0213
 */
async function turnCost(runtime, result) {
  const before = (await runtime.costBefore) ?? null;
  const now = await readTotal(runtime);
  runtime.costBefore = Promise.resolve(now);
  if (before !== null && now !== null) return Math.max(0, Math.round((now - before) * 1e8) / 1e8); // no float noise (0.020000000000000018)
  return typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null;
}

module.exports = { startCounting, turnCost };
