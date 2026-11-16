/** Does the GUI run against a custom model server (a local model)? Set by model-health.js from /api/model-health (its url is empty for Anthropic). */
let local = false;

export const setLocalModel = value => { local = Boolean(value); };
export const isLocalModel = () => local;
