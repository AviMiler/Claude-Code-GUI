/** Does the GUI run against a custom model server (a local model)? Set by model-health.js from /api/model-health (its url is empty for Anthropic). */
let local = false;
let known = false; // false until the first health answer arrives
const listeners = [];

export const setLocalModel = value => { local = Boolean(value); known = true; listeners.forEach(listener => listener()); };
export const isLocalModel = () => local;
/** The first health answer is in: before it, whether the model is local is unknown. */
export const isLocalModelKnown = () => known;
/** @param {() => void} listener called after every health answer */
export const onLocalModelAnswer = listener => { listeners.push(listener); };
