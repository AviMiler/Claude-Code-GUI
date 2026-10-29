# Dependencies

| Package | Version | Why |
|---|---|---|
| Node.js (runtime) | >= 18 | Built-in `http`, `child_process`, `fetch` and `AbortSignal.timeout` (model list); no npm packages are used |
| `claude` CLI | 2.1.246 (target) … 2.1.310 | The thing being wrapped. Tested with real turns on 2.1.246, 2.1.308, 2.1.310; optional flags are detected from `--help`, missing control requests degrade |
| `git` (optional) | any with `git worktree` | For the /diff panel, the session details rail's Changes card and branch, the Changes pane, and a worktree per session (create, remove on delete or archive, restore); without it (or outside a repository) the views say the folder is not a git repository and the welcome page's worktree switch stays disabled |
| Vision-capable model (optional) | any | Only for image attachments; other files work with any model (Claude reads them by path) |
| Model server (optional) | Anthropic, Ollama, LiteLLM or any OpenAI-compatible server | Only for the model list and the health dot: `GET {ANTHROPIC_BASE_URL}/v1/models` (list fallback on Ollama: `/api/tags`). Without it the list is the models in `config.json` and the dot is grey (unknown) |
