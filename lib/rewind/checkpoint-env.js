/** File checkpointing: the CLI snapshots the files its edit tools change only when this variable is set at its start. */
const ENV_NAME = 'CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING';

/** @param {{env?:object, fileCheckpointing?:boolean}} config @returns {object} config for startProcess; `fileCheckpointing: false` in config.json turns it off */
function withCheckpointing(config) {
  return config.fileCheckpointing === false ? config : { ...config, env: { ...config.env, [ENV_NAME]: '1' } };
}

module.exports = { withCheckpointing };
