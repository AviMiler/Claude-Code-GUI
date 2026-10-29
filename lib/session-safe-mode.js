/**
 * Safe mode: a session where a person always approves. It forbids the two permission modes that approve by themselves.
 * (dontAsk stays: it only denies.) A guard on the mode the GUI sets, not a sandbox: the CLI's own rules are unchanged.
 */
const FORBIDDEN_MODES = ['bypassPermissions', 'auto'];

const isForbidden = mode => FORBIDDEN_MODES.includes(mode);

module.exports = { isForbidden };
