/**
 * The Stop hook every GUI session process gets (merged into its --settings file by cli-args.js). The hook is always
 * there; the server answers "allow" while no check is stored, so storing or clearing a check needs no restart.
 * The command runs the server's own node (process.execPath, not `node` from PATH) on stop-hook.js, quoted for both
 * cmd.exe and a POSIX shell: a path holding a character neither quotes safely refuses the feature instead.
 */
const path = require('path');
const secrets = require('./verify-secrets');

const SCRIPT = path.join(__dirname, 'stop-hook.js');
const CHECK_TIMEOUT_MS = 120000;
const HOOK_TIMEOUT_S = 150; // longer than the check, or the CLI's default hook timeout kills it first
// " ends the quote everywhere; % expands in cmd.exe; $ ` \\ expand or escape inside a POSIX double quote; ! in cmd delayed expansion
const UNSAFE = /["%$`!\r\n\0]|\\\\/;

/** @returns {string|null} why the hook cannot be set up on this machine (Hebrew), or null */
function unavailableReason() {
  const bad = [process.execPath, SCRIPT].find(file => UNSAFE.test(file));
  return bad ? `הנתיב ${bad} מכיל תו שאי אפשר להעביר בבטחה בשורת פקודה (" % $ \` !), ולכן הבדיקה האוטומטית לא זמינה.` : null;
}

/**
 * @param {string} key the id the process starts under (a session id, or a spare's)
 * @param {number} port this server's port
 * @returns {object} settings keys to merge ({} when the hook cannot be set up)
 */
function hookSettings(key, port) {
  if (unavailableReason() || !/^[\w-]+$/.test(key) || !Number.isInteger(Number(port))) return {};
  secrets.issue(key);
  const command = `"${process.execPath}" "${SCRIPT}" ${Number(port)} ${key}`;
  return { hooks: { Stop: [{ hooks: [{ type: 'command', command, timeout: HOOK_TIMEOUT_S }] }] } };
}

module.exports = { hookSettings, unavailableReason, CHECK_TIMEOUT_MS, HOOK_TIMEOUT_S };
