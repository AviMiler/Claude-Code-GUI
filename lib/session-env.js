/** Environment variables a session's options set for its CLI process (nothing on the command line, so nothing to quote). */
const THINKING_ENV = 'MAX_THINKING_TOKENS';
// The CLI marks a `-p` conversation "sdk-cli" and its /resume picker hides those; any other entrypoint is listed
// (checked on 2.1.312). Set here, so one inherited from a terminal (where it is "cli", made "sdk-cli" by -p) is replaced.
const ENTRYPOINT = 'claude-code-gui';

/** @param {{env?:object}} config for startProcess @param {{thinkingOff?:boolean}} session @returns {object} config with the session's variables */
function withSessionEnv(config, session) {
  const env = { CLAUDE_CODE_ENTRYPOINT: ENTRYPOINT, ...config.env };
  if (session.thinkingOff) env[THINKING_ENV] = '0';
  return { ...config, env };
}

module.exports = { withSessionEnv, ENTRYPOINT };
