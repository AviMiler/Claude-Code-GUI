/** Environment variables a session's options set for its CLI process (nothing on the command line, so nothing to quote). */
const THINKING_ENV = 'MAX_THINKING_TOKENS';

/** @param {{env?:object}} config for startProcess @param {{thinkingOff?:boolean}} session @returns {object} config with the session's variables */
function withSessionEnv(config, session) {
  return session.thinkingOff ? { ...config, env: { ...config.env, [THINKING_ENV]: '0' } } : config;
}

module.exports = { withSessionEnv };
