/** Fake CLI (fake-claude.js): what its initialize answer lists (commands, agents, models, styles). */
function fakeCatalog(mode) {
  return {
    commands: [
      { name: 'compact', description: 'Free up context by summarizing the conversation so far', argumentHint: '<instructions>', builtin: true },
      { name: 'context', description: 'Show current context usage', argumentHint: '', builtin: true },
      { name: 'init', description: 'Initialize a new CLAUDE.md file', argumentHint: '', builtin: true },
      { name: 'dataviz', description: 'Bundled skill for charts', argumentHint: '', builtin: true },
      { name: 'hello-skill', description: 'Says hello (project)', argumentHint: '' },
      { name: 'my-plugin:deploy', description: 'Deploy via plugin (plugin)', argumentHint: '<env>' },
    ],
    agents: [{ name: 'Explore', description: 'Fast read-only search agent' }, { name: 'bar-agent', description: 'Test agent', model: 'haiku' }],
    models: [{ value: 'default', displayName: 'Default (recommended)', description: 'Fake default', supportedEffortLevels: ['low', 'medium', 'high'] },
      { value: 'sonnet', displayName: 'Sonnet', description: 'Fake sonnet', supportedEffortLevels: ['low', 'medium', 'high'] }],
    output_style: 'default', available_output_styles: ['default', 'Explanatory', 'Learning'],
    claude_code_version: '2.1.308', current_permission_mode: mode, account: { apiProvider: 'firstParty' },
  };
}

module.exports = { fakeCatalog };
